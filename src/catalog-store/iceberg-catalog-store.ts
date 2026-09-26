/*
<MODULE_CONTRACT>
<purpose>Implement the append-only CatalogStore over one coherent project-scoped Iceberg history snapshot.</purpose>
<non-goals><item>Do not coordinate revisions, upload artifacts, ingest facts, or perform catalog I/O inside SQLite transactions.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1003: add idempotent catalog commits, predecessor CAS, and safe history reconstruction.</item></CHANGE_SUMMARY>
*/

import {
  assertTenantScope,
  failure,
  success,
  type CatalogCommit,
  type CatalogStore,
  type DomainResult,
  type JsonValue,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";
import {
  IcebergHistoryConflictError,
  type IcebergHistoryClient,
  type IcebergHistoryRow,
  type IcebergHistorySnapshot,
} from "./iceberg-history-client.ts";
import { isProjektarchivLogicalTable, recordSchemaIdentity } from "./logical-tables.ts";

type CatalogFailureCode =
  "PA_SCOPE_MISMATCH" | "PA_REVISION_CONFLICT" | "PA_NOT_FOUND" | "PA_UNAVAILABLE";
type CatalogResult<Value> = DomainResult<Value, CatalogFailureCode>;

function canonicalJson(value: JsonValue | CatalogCommit): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry as JsonValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function rowsForCommit(commit: CatalogCommit): readonly IcebergHistoryRow[] | null {
  const rows: IcebergHistoryRow[] = [];
  for (const [recordIndex, record] of commit.records.entries()) {
    if (!isProjektarchivLogicalTable(record.table)) return null;
    const schemaVersion = recordSchemaIdentity(record.value);
    if (!schemaVersion) return null;
    rows.push({
      rowKind: "record",
      commitId: commit.commitId,
      previousCommitId: commit.previousCommitId,
      recordIndex,
      logicalTable: record.table,
      schemaVersion,
      payloadJson: canonicalJson(record.value),
    });
  }
  rows.push({
    rowKind: "commit",
    commitId: commit.commitId,
    previousCommitId: commit.previousCommitId,
    recordIndex: -1,
    logicalTable: null,
    schemaVersion: "projektarchiv.catalog-commit@1",
    payloadJson: canonicalJson(commit),
  });
  return rows;
}

function decodeHistory(snapshot: IcebergHistorySnapshot, scope: TenantScope) {
  const recordsByCommit = new Map<string, IcebergHistoryRow[]>();
  const markers = new Map<string, IcebergHistoryRow>();
  for (const row of snapshot.rows) {
    if (row.rowKind === "commit") {
      if (markers.has(row.commitId)) throw new Error("duplicate catalog marker");
      markers.set(row.commitId, row);
    } else recordsByCommit.set(row.commitId, [...(recordsByCommit.get(row.commitId) ?? []), row]);
  }
  const decoded = new Map<string, CatalogCommit>();
  const successors = new Map<string | null, string>();
  for (const marker of markers.values()) {
    if (
      marker.logicalTable !== null ||
      marker.recordIndex !== -1 ||
      marker.schemaVersion !== "projektarchiv.catalog-commit@1" ||
      successors.has(marker.previousCommitId)
    ) {
      throw new Error("invalid or branching catalog marker chain");
    }
    const parsed = JSON.parse(marker.payloadJson) as CatalogCommit;
    if (
      canonicalJson(parsed) !== marker.payloadJson ||
      canonicalJson(parsed.scope) !== canonicalJson(scope) ||
      parsed.commitId !== marker.commitId ||
      parsed.previousCommitId !== marker.previousCommitId ||
      !Array.isArray(parsed.records)
    )
      throw new Error("invalid catalog marker content");
    const expectedRows = rowsForCommit(parsed);
    const persistedRows = (recordsByCommit.get(marker.commitId) ?? []).sort(
      (left, right) => left.recordIndex - right.recordIndex,
    );
    if (
      !expectedRows ||
      canonicalJson(expectedRows.slice(0, -1) as unknown as JsonValue) !==
        canonicalJson(persistedRows as unknown as JsonValue)
    ) {
      throw new Error("catalog marker records are incomplete or divergent");
    }
    decoded.set(parsed.commitId, parsed);
    successors.set(parsed.previousCommitId, parsed.commitId);
    recordsByCommit.delete(parsed.commitId);
  }
  if (recordsByCommit.size > 0) throw new Error("orphan catalog records");
  const commits = new Map<string, CatalogCommit>();
  let current: CatalogCommit | null = null;
  let nextId = successors.get(null);
  while (nextId) {
    const next = decoded.get(nextId);
    if (!next || commits.has(nextId)) throw new Error("cyclic or dangling catalog marker chain");
    commits.set(nextId, next);
    current = next;
    nextId = successors.get(nextId);
  }
  if (commits.size !== decoded.size) throw new Error("disconnected catalog marker chain");
  return { commits, current };
}

export class IcebergCatalogStore implements CatalogStore {
  constructor(
    private readonly client: IcebergHistoryClient,
    private readonly authoritativeScope: TenantScope,
  ) {}

  async appendCommit(commit: CatalogCommit): Promise<CatalogResult<CatalogCommit>> {
    const checked = assertTenantScope(this.authoritativeScope, commit.scope);
    if (!checked.ok) return checked;
    const rows = rowsForCommit(commit);
    if (!rows) return failure("PA_UNAVAILABLE", "catalog commit contains an unsupported record");
    try {
      await this.client.ensureProjectTable(commit.scope);
      const snapshot = await this.client.readSnapshot(commit.scope);
      const history = decodeHistory(snapshot, this.authoritativeScope);
      const existing = history.commits.get(commit.commitId);
      if (existing)
        return canonicalJson(existing) === canonicalJson(commit)
          ? success(existing)
          : failure("PA_REVISION_CONFLICT", "commit id is bound to other content");
      if (commit.previousCommitId !== (history.current?.commitId ?? null)) {
        return failure("PA_REVISION_CONFLICT", "catalog predecessor is no longer current");
      }
      await this.client.appendSnapshot(commit.scope, snapshot.snapshotId, rows);
      return success(commit);
    } catch (error) {
      return error instanceof IcebergHistoryConflictError
        ? failure("PA_REVISION_CONFLICT", "catalog snapshot was advanced by another writer")
        : failure("PA_UNAVAILABLE", "catalog storage is unavailable or invalid");
    }
  }

  async getCommit(
    request: TenantScope & { readonly commitId: string },
  ): Promise<CatalogResult<CatalogCommit>> {
    const history = await this.history(request);
    if (!history.ok) return history;
    const commit = history.value.commits.get(request.commitId);
    return commit
      ? success(commit)
      : failure("PA_NOT_FOUND", "catalog commit not found in authoritative scope");
  }

  async getCurrentCommit(scope: TenantScope): Promise<CatalogResult<CatalogCommit | null>> {
    const history = await this.history(scope);
    return history.ok ? success(history.value.current) : history;
  }

  private async history(
    scope: TenantScope,
  ): Promise<CatalogResult<ReturnType<typeof decodeHistory>>> {
    const checked = assertTenantScope(this.authoritativeScope, scope);
    if (!checked.ok) return checked;
    try {
      await this.client.ensureProjectTable(scope);
      return success(decodeHistory(await this.client.readSnapshot(scope), this.authoritativeScope));
    } catch {
      return failure("PA_UNAVAILABLE", "catalog storage is unavailable or invalid");
    }
  }
}

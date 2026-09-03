/*
<MODULE_CONTRACT>
<purpose>Translate the Projektarchiv history seam to the pinned Icebird REST catalog and Parquet writer.</purpose>
<non-goals><item>Do not expose credentials, Icebird types, table layout, or provider errors through core.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1003: implement the proved R2 Data Catalog client behind snapshot-CAS semantics.</item></CHANGE_SUMMARY>
*/

import {
  IcebergTransactionConflictError,
  icebergCreateTable,
  icebergRead,
  icebergTransaction,
  restCatalogConnect,
  restCatalogCreateNamespace,
  restCatalogListNamespaces,
  restCatalogListTables,
  restCatalogLoadTable,
  s3SignedResolver,
} from "icebird";
import type { TenantScope } from "@warpgogol/projektarchiv-core";
import {
  IcebergHistoryConflictError,
  type IcebergHistoryClient,
  type IcebergHistoryRow,
} from "./iceberg-history-client.ts";
import { isProjektarchivLogicalTable } from "./logical-tables.ts";

export interface IcebirdHistoryClientConfig {
  readonly catalogUrl: string;
  readonly warehouse: string;
  readonly catalogToken: string;
  readonly r2AccountId: string;
  readonly r2AccessKeyId: string;
  readonly r2SecretAccessKey: string;
  readonly namespace?: string;
}

const historySchema = {
  type: "struct" as const,
  "schema-id": 0,
  fields: [
    { id: 1, name: "row_kind", required: true, type: "string" as const },
    { id: 2, name: "commit_id", required: true, type: "string" as const },
    { id: 3, name: "previous_commit_id", required: false, type: "string" as const },
    { id: 4, name: "record_index", required: true, type: "int" as const },
    { id: 5, name: "logical_table", required: false, type: "string" as const },
    { id: 6, name: "schema_version", required: true, type: "string" as const },
    { id: 7, name: "payload_json", required: true, type: "string" as const },
  ],
};

function currentSnapshotId(metadata: Record<string, unknown>): string | null {
  const value = metadata["current-snapshot-id"];
  return value === null || value === undefined ? null : String(value);
}

async function tableName(scope: TenantScope): Promise<string> {
  const identity = `${scope.tenantId}:${scope.clientId}:${scope.projectId}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const suffix = Array.from(new Uint8Array(digest).slice(0, 16), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `history_${suffix}`;
}

function decodeRow(raw: Record<string, unknown>): IcebergHistoryRow {
  const rowKind = raw.row_kind;
  const previousCommitId = raw.previous_commit_id;
  const logicalTable = raw.logical_table;
  if (
    (rowKind !== "record" && rowKind !== "commit") ||
    typeof raw.commit_id !== "string" ||
    (previousCommitId !== null && previousCommitId !== undefined && typeof previousCommitId !== "string") ||
    typeof raw.record_index !== "number" ||
    !Number.isInteger(raw.record_index) ||
    (logicalTable !== null && logicalTable !== undefined &&
      (typeof logicalTable !== "string" || !isProjektarchivLogicalTable(logicalTable))) ||
    typeof raw.schema_version !== "string" ||
    typeof raw.payload_json !== "string"
  ) {
    throw new Error("invalid Iceberg history row");
  }
  return {
    rowKind,
    commitId: raw.commit_id,
    previousCommitId: previousCommitId ?? null,
    recordIndex: raw.record_index,
    logicalTable: logicalTable ?? null,
    schemaVersion: raw.schema_version,
    payloadJson: raw.payload_json,
  };
}

export class IcebirdHistoryClient implements IcebergHistoryClient {
  private readonly namespace: string;
  private readonly resolver;

  constructor(private readonly config: IcebirdHistoryClientConfig) {
    this.namespace = config.namespace ?? "projektarchiv";
    this.resolver = s3SignedResolver({
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      region: "auto",
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      pathStyle: true,
    });
  }

  async ensureProjectTable(scope: TenantScope): Promise<void> {
    const catalog = await this.catalog();
    const namespaces = await restCatalogListNamespaces(catalog);
    if (!namespaces.some((entry) => entry.length === 1 && entry[0] === this.namespace)) {
      try {
        await restCatalogCreateNamespace(catalog, { namespace: this.namespace });
      } catch {
        const refreshed = await restCatalogListNamespaces(catalog);
        if (!refreshed.some((entry) => entry.length === 1 && entry[0] === this.namespace)) throw new Error("catalog namespace unavailable");
      }
    }
    const name = await tableName(scope);
    const tables = await restCatalogListTables(catalog, { namespace: this.namespace });
    if (tables.some((entry) => entry.name === name)) return;
    try {
      await icebergCreateTable({ catalog, namespace: this.namespace, table: name,
        schema: historySchema, properties: { "projektarchiv.schema-version": "projektarchiv.catalog-history@1" } });
    } catch {
      const refreshed = await restCatalogListTables(catalog, { namespace: this.namespace });
      if (!refreshed.some((entry) => entry.name === name)) throw new Error("catalog table unavailable");
    }
  }

  async readSnapshot(scope: TenantScope) {
    const catalog = await this.catalog();
    const loaded = await restCatalogLoadTable(catalog, { namespace: this.namespace, table: await tableName(scope) });
    const rows = await icebergRead({ tableUrl: loaded.metadata.location, metadata: loaded.metadata, resolver: this.resolver });
    return { snapshotId: currentSnapshotId(loaded.metadata as unknown as Record<string, unknown>), rows: rows.map(decodeRow) };
  }

  async appendSnapshot(scope: TenantScope, expectedSnapshotId: string | null, rows: readonly IcebergHistoryRow[]) {
    const catalog = await this.catalog();
    const name = await tableName(scope);
    const before = await restCatalogLoadTable(catalog, { namespace: this.namespace, table: name });
    if (currentSnapshotId(before.metadata as unknown as Record<string, unknown>) !== expectedSnapshotId) {
      throw new IcebergHistoryConflictError();
    }
    try {
      const metadata = await icebergTransaction(
        { catalog, namespace: this.namespace, table: name, resolver: this.resolver },
        async (transaction) => {
          await transaction.append({ records: rows.map((row) => ({
            row_kind: row.rowKind, commit_id: row.commitId,
            previous_commit_id: row.previousCommitId, record_index: row.recordIndex,
            logical_table: row.logicalTable, schema_version: row.schemaVersion,
            payload_json: row.payloadJson,
          })) });
        },
      );
      const snapshotId = currentSnapshotId(metadata as unknown as Record<string, unknown>);
      if (!snapshotId) throw new Error("Iceberg append returned no snapshot identity");
      return { snapshotId };
    } catch (error) {
      if (error instanceof IcebergTransactionConflictError) throw new IcebergHistoryConflictError();
      throw error;
    }
  }

  private catalog() {
    return restCatalogConnect({
      url: this.config.catalogUrl,
      warehouse: this.config.warehouse,
      requestInit: { headers: { Authorization: `Bearer ${this.config.catalogToken}`,
        "X-Iceberg-Access-Delegation": "vended-credentials" } },
    });
  }
}

/*
<MODULE_CONTRACT>
<purpose>Persist idempotent capture runs and payload-free capture issues in project-local synchronous SQLite.</purpose>
<non-goals><item>Do not call source, R2, catalog, or any external authority inside journal transactions.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1007: add the durable capture lifecycle journal adapter.</item></CHANGE_SUMMARY>
*/

import {
  assertTenantScope,
  captureRunSchema,
  transitionCaptureRun,
  type CaptureRun,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";
import {
  captureCanonicalJson,
  type CaptureIssue,
  type CaptureResult,
  type CaptureRunStore,
} from "@warpgogol/projektarchiv-operations/capture";
import type { SyncSqlStorage } from "../coordinator/sql.ts";

interface Row {
  payload_json: string;
}
export class SqliteCaptureRunStore implements CaptureRunStore {
  constructor(
    private readonly storage: SyncSqlStorage,
    private readonly authoritativeScope: TenantScope,
  ) {
    storage.exec(`CREATE TABLE IF NOT EXISTS capture_runs (operation_id TEXT PRIMARY KEY, capture_run_id TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS capture_issues (issue_id TEXT PRIMARY KEY, capture_run_id TEXT NOT NULL, payload_json TEXT NOT NULL);`);
  }
  async create(input: CaptureRun): Promise<CaptureResult<CaptureRun>> {
    const scope = assertTenantScope(this.authoritativeScope, input);
    if (!scope.ok) return scope;
    let run: CaptureRun;
    try {
      run = captureRunSchema.parse(input);
    } catch {
      return this.failed("PA_RECOVERY_AMBIGUOUS", "capture run is invalid");
    }
    try {
      return this.storage.transactionSync(() => {
        const row = this.storage
          .exec<Row>(
            "SELECT payload_json FROM capture_runs WHERE operation_id = ?",
            run.operationId,
          )
          .toArray()[0];
        if (row) {
          const prior = captureRunSchema.parse(JSON.parse(row.payload_json));
          return prior.captureRunId === run.captureRunId
            ? { ok: true as const, value: prior }
            : this.failed(
                "PA_REVISION_CONFLICT",
                "operation identity belongs to another capture run",
              );
        }
        this.storage.exec(
          "INSERT INTO capture_runs (operation_id, capture_run_id, payload_json) VALUES (?, ?, ?)",
          run.operationId,
          run.captureRunId,
          captureCanonicalJson(run),
        );
        return { ok: true as const, value: run };
      });
    } catch {
      return this.failed("PA_UNAVAILABLE", "capture journal is unavailable");
    }
  }
  async get(scope: TenantScope, operationId: string): Promise<CaptureResult<CaptureRun | null>> {
    const checked = assertTenantScope(this.authoritativeScope, scope);
    if (!checked.ok) return checked;
    try {
      const row = this.storage
        .exec<Row>("SELECT payload_json FROM capture_runs WHERE operation_id = ?", operationId)
        .toArray()[0];
      return { ok: true, value: row ? captureRunSchema.parse(JSON.parse(row.payload_json)) : null };
    } catch {
      return this.failed("PA_UNAVAILABLE", "capture journal is unavailable");
    }
  }
  async transition(
    request: Parameters<CaptureRunStore["transition"]>[0],
  ): Promise<CaptureResult<CaptureRun>> {
    const checked = assertTenantScope(this.authoritativeScope, request.scope);
    if (!checked.ok) return checked;
    try {
      return this.storage.transactionSync(() => {
        const row = this.storage
          .exec<Row>(
            "SELECT payload_json FROM capture_runs WHERE operation_id = ?",
            request.operationId,
          )
          .toArray()[0];
        if (!row) return this.failed("PA_RECOVERY_AMBIGUOUS", "capture run does not exist");
        const run = captureRunSchema.parse(JSON.parse(row.payload_json));
        if (run.state !== request.expected)
          return this.failed("PA_REVISION_CONFLICT", "capture state changed concurrently");
        const allowed = transitionCaptureRun(run.state, request.next);
        if (!allowed.ok) return this.failed("PA_REVISION_CONFLICT", allowed.detail);
        const next = captureRunSchema.parse({
          ...run,
          state: request.next,
          updatedAt: request.updatedAt,
          ...(request.errorCode !== undefined ? { errorCode: request.errorCode } : {}),
          ...(request.committedSnapshotId !== undefined
            ? { committedSnapshotId: request.committedSnapshotId }
            : {}),
        });
        this.storage.exec(
          "UPDATE capture_runs SET payload_json = ? WHERE operation_id = ?",
          captureCanonicalJson(next),
          request.operationId,
        );
        return { ok: true as const, value: next };
      });
    } catch {
      return this.failed("PA_UNAVAILABLE", "capture journal is unavailable");
    }
  }
  async appendIssue(issue: CaptureIssue): Promise<CaptureResult<CaptureIssue>> {
    const checked = assertTenantScope(this.authoritativeScope, issue.scope);
    if (!checked.ok) return checked;
    try {
      return this.storage.transactionSync(() => {
        const existing = this.storage
          .exec<Row>("SELECT payload_json FROM capture_issues WHERE issue_id = ?", issue.issueId)
          .toArray()[0];
        if (existing) {
          const prior = JSON.parse(existing.payload_json) as CaptureIssue;
          return captureCanonicalJson(prior) === captureCanonicalJson(issue)
            ? { ok: true as const, value: prior }
            : this.failed("PA_REVISION_CONFLICT", "capture issue identity collision");
        }
        const run = this.storage
          .exec<Row>(
            "SELECT payload_json FROM capture_runs WHERE capture_run_id = ?",
            issue.captureRunId,
          )
          .toArray()[0];
        if (!run) return this.failed("PA_RECOVERY_AMBIGUOUS", "capture issue has no durable run");
        this.storage.exec(
          "INSERT INTO capture_issues (issue_id, capture_run_id, payload_json) VALUES (?, ?, ?)",
          issue.issueId,
          issue.captureRunId,
          captureCanonicalJson(issue),
        );
        return { ok: true as const, value: issue };
      });
    } catch {
      return this.failed("PA_UNAVAILABLE", "capture issue journal is unavailable");
    }
  }
  private failed<Code extends "PA_RECOVERY_AMBIGUOUS" | "PA_REVISION_CONFLICT" | "PA_UNAVAILABLE">(
    code: Code,
    detail: string,
  ) {
    return { ok: false as const, code, detail };
  }
}

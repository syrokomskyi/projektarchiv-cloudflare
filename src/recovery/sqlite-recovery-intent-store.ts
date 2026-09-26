/*
<MODULE_CONTRACT>
<purpose>Persist create-only recovery intents and deterministic audit closure in project-local synchronous SQLite.</purpose>
<non-goals><item>Do not perform R2, catalog, HTTP, or other external I/O inside journal transactions.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1005: add the durable recovery provenance journal adapter.</item></CHANGE_SUMMARY>
*/

import { assertTenantScope, type TenantScope } from "@warpgogol/projektarchiv-core";
import {
  canonicalJson,
  recoveryIntentHash,
  recoveryIntentSchema,
  type RecoveryAuditEvent,
  type RecoveryIntent,
  type RecoveryIntentStore,
  type RecoveryPortResult,
} from "@warpgogol/projektarchiv-operations/recovery";
import type { SyncSqlStorage } from "../coordinator/sql.ts";

interface IntentRow {
  payload_json: string;
  intent_hash: string;
}
interface AuditRow {
  payload_json: string;
  intent_hash: string;
  operation_id: string;
}

export class SqliteRecoveryIntentStore implements RecoveryIntentStore {
  constructor(
    private readonly storage: SyncSqlStorage,
    private readonly authoritativeScope: TenantScope,
  ) {
    storage.exec(`
      CREATE TABLE IF NOT EXISTS recovery_intents (
        operation_id TEXT PRIMARY KEY,
        intent_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recovery_audits (
        audit_id TEXT PRIMARY KEY,
        intent_hash TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
  }

  async create(input: RecoveryIntent): Promise<RecoveryPortResult<RecoveryIntent>> {
    const checked = assertTenantScope(this.authoritativeScope, input.scope);
    if (!checked.ok) return checked;
    let intent: RecoveryIntent;
    try {
      intent = recoveryIntentSchema.parse(input);
    } catch {
      return this.failed("PA_RECOVERY_AMBIGUOUS", "recovery intent is invalid");
    }
    const hash = await recoveryIntentHash(intent);
    try {
      return this.storage.transactionSync(() => {
        const existing = this.storage
          .exec<IntentRow>(
            "SELECT intent_hash, payload_json FROM recovery_intents WHERE operation_id = ?",
            intent.operationId,
          )
          .toArray()[0];
        if (existing)
          return existing.intent_hash === hash
            ? {
                ok: true as const,
                value: recoveryIntentSchema.parse(JSON.parse(existing.payload_json)),
              }
            : this.failed(
                "PA_REVISION_CONFLICT",
                "operation identity is bound to another recovery intent",
              );
        this.storage.exec(
          "INSERT INTO recovery_intents (operation_id, intent_hash, payload_json) VALUES (?, ?, ?)",
          intent.operationId,
          hash,
          canonicalJson(intent),
        );
        return { ok: true as const, value: intent };
      });
    } catch {
      return this.failed("PA_UNAVAILABLE", "recovery journal is unavailable");
    }
  }

  async get(
    scope: TenantScope,
    operationId: string,
  ): Promise<RecoveryPortResult<RecoveryIntent | null>> {
    const checked = assertTenantScope(this.authoritativeScope, scope);
    if (!checked.ok) return checked;
    try {
      const row = this.storage
        .exec<IntentRow>(
          "SELECT intent_hash, payload_json FROM recovery_intents WHERE operation_id = ?",
          operationId,
        )
        .toArray()[0];
      if (!row) return { ok: true, value: null };
      const intent = recoveryIntentSchema.parse(JSON.parse(row.payload_json));
      return (await recoveryIntentHash(intent)) === row.intent_hash
        ? { ok: true, value: intent }
        : this.failed("PA_RECOVERY_AMBIGUOUS", "recovery intent journal integrity mismatch");
    } catch {
      return this.failed("PA_UNAVAILABLE", "recovery journal is unavailable");
    }
  }

  async appendAudit(event: RecoveryAuditEvent): Promise<RecoveryPortResult<RecoveryAuditEvent>> {
    try {
      return this.storage.transactionSync(() => {
        const intent = this.storage
          .exec<IntentRow>(
            "SELECT intent_hash, payload_json FROM recovery_intents WHERE operation_id = ?",
            event.operationId,
          )
          .toArray()[0];
        if (!intent || intent.intent_hash !== event.intentHash) {
          return this.failed(
            "PA_RECOVERY_AMBIGUOUS",
            "audit does not bind to the exact durable recovery intent",
          );
        }
        const existing = this.storage
          .exec<AuditRow>(
            "SELECT intent_hash, operation_id, payload_json FROM recovery_audits WHERE audit_id = ?",
            event.auditId,
          )
          .toArray()[0];
        if (existing) {
          return existing.intent_hash === event.intentHash &&
            existing.operation_id === event.operationId
            ? { ok: true as const, value: JSON.parse(existing.payload_json) as RecoveryAuditEvent }
            : this.failed("PA_REVISION_CONFLICT", "audit identity collision");
        }
        this.storage.exec(
          "INSERT INTO recovery_audits (audit_id, intent_hash, operation_id, payload_json) VALUES (?, ?, ?, ?)",
          event.auditId,
          event.intentHash,
          event.operationId,
          canonicalJson(event),
        );
        return { ok: true as const, value: event };
      });
    } catch {
      return this.failed("PA_UNAVAILABLE", "recovery audit journal is unavailable");
    }
  }

  private failed<Code extends "PA_RECOVERY_AMBIGUOUS" | "PA_REVISION_CONFLICT" | "PA_UNAVAILABLE">(
    code: Code,
    detail: string,
  ): { readonly ok: false; readonly code: Code; readonly detail: string } {
    return { ok: false, code, detail };
  }
}

/*
<MODULE_CONTRACT>
<purpose>Persist exact erasure plans and per-target receipts atomically while redacting locators after verified completion.</purpose>
<non-goals><item>Do not call destructive providers or discover plan targets inside SQLite transactions.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1009: add durable project-local erasure execution state.</item><item>RFC-1009: composite receipt key and operation-bound completion.</item></CHANGE_SUMMARY>
*/

import { assertTenantScope, success, type TenantScope } from "@warpgogol/projektarchiv-core";
import {
  erasurePlanSchema,
  type ErasurePlan,
  type ErasurePlanStore,
  type ErasureReceipt,
} from "@warpgogol/projektarchiv-operations/retention";
import {
  knowledgeCanonicalJson,
  type KnowledgeResult,
} from "@warpgogol/projektarchiv-operations/knowledge";
import type { SyncSqlStorage } from "../coordinator/sql.ts";

interface Row {
  payload_json: string;
}
export class SqliteErasurePlanStore implements ErasurePlanStore {
  constructor(
    private readonly storage: SyncSqlStorage,
    private readonly authoritativeScope: TenantScope,
  ) {
    storage.exec(`CREATE TABLE IF NOT EXISTS erasure_plans (plan_id TEXT PRIMARY KEY, plan_sha256 TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS erasure_receipts (plan_id TEXT NOT NULL, authority TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, payload_json TEXT NOT NULL,
      PRIMARY KEY (plan_id, authority, target_type, target_id));`);
  }
  async create(plan: ErasurePlan): Promise<KnowledgeResult<ErasurePlan>> {
    const scoped = assertTenantScope(this.authoritativeScope, plan.scope);
    if (!scoped.ok) return scoped;
    try {
      return this.storage.transactionSync(() => {
        const prior = this.find(plan.planId);
        if (prior)
          return prior.planSha256 === plan.planSha256 &&
            knowledgeCanonicalJson(prior) === knowledgeCanonicalJson(plan)
            ? success(prior)
            : this.fail("PA_REVISION_CONFLICT", "plan identity conflict");
        const parsed = erasurePlanSchema.parse(plan);
        this.storage.exec(
          "INSERT INTO erasure_plans (plan_id, plan_sha256, payload_json) VALUES (?, ?, ?)",
          parsed.planId,
          parsed.planSha256,
          JSON.stringify(parsed),
        );
        return success(parsed);
      });
    } catch {
      return this.fail("PA_UNAVAILABLE", "erasure plan storage unavailable");
    }
  }
  async get(scope: TenantScope, planId: string) {
    const scoped = assertTenantScope(this.authoritativeScope, scope);
    if (!scoped.ok) return scoped;
    try {
      return success(this.find(planId));
    } catch {
      return this.fail("PA_UNAVAILABLE", "erasure plan lookup unavailable");
    }
  }
  async receipt(
    scope: TenantScope,
    planId: string,
    authority: string,
    targetType: string,
    targetId: string,
  ): Promise<KnowledgeResult<ErasureReceipt | null>> {
    const scoped = assertTenantScope(this.authoritativeScope, scope);
    if (!scoped.ok) return scoped;
    try {
      const row = this.storage
        .exec<Row>(
          "SELECT payload_json FROM erasure_receipts WHERE plan_id = ? AND authority = ? AND target_type = ? AND target_id = ?",
          planId,
          authority,
          targetType,
          targetId,
        )
        .toArray()[0];
      return success(row ? (JSON.parse(row.payload_json) as ErasureReceipt) : null);
    } catch {
      return this.fail("PA_UNAVAILABLE", "erasure receipt lookup unavailable");
    }
  }
  async recordReceipt(
    scope: TenantScope,
    planId: string,
    receipt: ErasureReceipt,
  ): Promise<KnowledgeResult<ErasureReceipt>> {
    const scoped = assertTenantScope(this.authoritativeScope, scope);
    if (!scoped.ok) return scoped;
    try {
      return this.storage.transactionSync(() => {
        if (!this.find(planId)) return this.fail("PA_NOT_FOUND", "erasure plan missing");
        const row = this.storage
          .exec<Row>(
            "SELECT payload_json FROM erasure_receipts WHERE plan_id = ? AND authority = ? AND target_type = ? AND target_id = ?",
            planId,
            receipt.authority,
            receipt.targetType,
            receipt.targetId,
          )
          .toArray()[0];
        if (row) {
          const prior = JSON.parse(row.payload_json) as ErasureReceipt;
          return knowledgeCanonicalJson(prior) === knowledgeCanonicalJson(receipt)
            ? success(prior)
            : this.fail("PA_REVISION_CONFLICT", "receipt identity conflict");
        }
        this.storage.exec(
          "INSERT INTO erasure_receipts (plan_id, authority, target_type, target_id, payload_json) VALUES (?, ?, ?, ?, ?)",
          planId,
          receipt.authority,
          receipt.targetType,
          receipt.targetId,
          JSON.stringify(receipt),
        );
        return success(receipt);
      });
    } catch {
      return this.fail("PA_UNAVAILABLE", "erasure receipt storage unavailable");
    }
  }
  async complete(
    scope: TenantScope,
    planId: string,
    planSha256: string,
    completedByOperationId: string,
    completedAt: string,
  ): Promise<KnowledgeResult<ErasurePlan>> {
    const scoped = assertTenantScope(this.authoritativeScope, scope);
    if (!scoped.ok) return scoped;
    try {
      return this.storage.transactionSync(() => {
        const prior = this.find(planId);
        if (!prior) return this.fail("PA_NOT_FOUND", "erasure plan missing");
        if (prior.planSha256 !== planSha256)
          return this.fail("PA_REVISION_CONFLICT", "plan hash mismatch");
        if (prior.status === "completed") return success(prior);
        const receiptCount =
          this.storage
            .exec<{ count: number }>(
              "SELECT COUNT(*) AS count FROM erasure_receipts WHERE plan_id = ?",
              planId,
            )
            .toArray()[0]?.count ?? 0;
        if (receiptCount !== prior.targets.length)
          return this.fail("PA_REVISION_CONFLICT", "plan receipts incomplete");
        const next = erasurePlanSchema.parse({
          ...prior,
          status: "completed",
          completedAt,
          completedByOperationId,
          targets: prior.targets.map((target) => ({
            ...target,
            locator: {},
            expectedSha256: undefined,
          })),
        });
        this.storage.exec(
          "UPDATE erasure_plans SET payload_json = ? WHERE plan_id = ?",
          JSON.stringify(next),
          planId,
        );
        return success(next);
      });
    } catch {
      return this.fail("PA_UNAVAILABLE", "erasure plan completion unavailable");
    }
  }
  private find(planId: string): ErasurePlan | null {
    const row = this.storage
      .exec<Row>("SELECT payload_json FROM erasure_plans WHERE plan_id = ?", planId)
      .toArray()[0];
    return row ? erasurePlanSchema.parse(JSON.parse(row.payload_json)) : null;
  }
  private fail<Code extends "PA_NOT_FOUND" | "PA_REVISION_CONFLICT" | "PA_UNAVAILABLE">(
    code: Code,
    detail: string,
  ) {
    return { ok: false as const, code, detail };
  }
}

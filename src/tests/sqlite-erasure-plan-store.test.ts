import { describe, expect, it } from "vitest";
import {
  erasurePlanSchema,
  type ErasurePlan,
  type ErasureReceipt,
} from "@warpgogol/projektarchiv-operations/retention";
import { SqliteErasurePlanStore } from "../erasure/sqlite-erasure-plan-store.ts";
import { NodeSqlStorage } from "../testing/node-sql-storage.ts";
import { scope, foreignScope } from "../testing/fixtures.ts";

const now = "2026-10-02T00:00:00.000Z";
const planSha = "a".repeat(64);

function makePlan(overrides: Partial<ErasurePlan> = {}): ErasurePlan {
  return erasurePlanSchema.parse({
    schema: "projektarchiv.erasure-plan@1",
    scope,
    planId: "plan-1",
    caseId: "case-1",
    operationId: "plan-op",
    planSha256: planSha,
    status: "prepared",
    targets: [
      {
        targetType: "artifact_revision",
        targetId: "raw",
        dataClass: "operational",
        authority: "artifact",
        locator: { objectKey: "private/raw" },
        action: "erase",
        reasonClass: "operational-30",
      },
    ],
    approvedBy: "legal",
    createdAt: now,
    ...overrides,
  });
}

function makeReceipt(overrides: Partial<ErasureReceipt> = {}): ErasureReceipt {
  return {
    authority: "artifact",
    targetType: "artifact_revision",
    targetId: "raw",
    action: "erase",
    operationId: "execute-op",
    completedAt: now,
    ...overrides,
  };
}

describe("SqliteErasurePlanStore", () => {
  it("creates and retrieves an exact plan idempotently", async () => {
    const sql = new NodeSqlStorage();
    const store = new SqliteErasurePlanStore(sql, scope);
    const plan = makePlan();
    const first = await store.create(plan);
    const replay = await store.create(plan);
    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect(first).toEqual(replay);
    const got = await store.get(scope, "plan-1");
    expect(got.ok && got.value?.planId).toBe("plan-1");
    sql.close();
  });

  it("rejects a conflicting plan with the same planId but different hash", async () => {
    const sql = new NodeSqlStorage();
    const store = new SqliteErasurePlanStore(sql, scope);
    await store.create(makePlan());
    const conflict = await store.create(makePlan({ planSha256: "b".repeat(64) }));
    expect(conflict.ok).toBe(false);
    expect(conflict.ok === false && conflict.code).toBe("PA_REVISION_CONFLICT");
    sql.close();
  });

  it("records and retrieves receipts by composite key", async () => {
    const sql = new NodeSqlStorage();
    const store = new SqliteErasurePlanStore(sql, scope);
    await store.create(makePlan());
    const receipt = makeReceipt();
    const recorded = await store.recordReceipt(scope, "plan-1", receipt);
    expect(recorded.ok).toBe(true);
    const fetched = await store.receipt(scope, "plan-1", "artifact", "artifact_revision", "raw");
    expect(fetched.ok && fetched.value?.operationId).toBe("execute-op");
    const replay = await store.recordReceipt(scope, "plan-1", receipt);
    expect(replay).toEqual(recorded);
    sql.close();
  });

  it("rejects receipt recording for a missing plan", async () => {
    const sql = new NodeSqlStorage();
    const store = new SqliteErasurePlanStore(sql, scope);
    const result = await store.recordReceipt(scope, "missing", makeReceipt());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("PA_NOT_FOUND");
    sql.close();
  });

  it("completes a plan with redacted locators only after all receipts are recorded", async () => {
    const sql = new NodeSqlStorage();
    const store = new SqliteErasurePlanStore(sql, scope);
    const plan = makePlan({
      targets: [
        {
          targetType: "artifact_revision",
          targetId: "raw",
          dataClass: "operational",
          authority: "artifact",
          locator: { objectKey: "private/raw" },
          action: "erase",
          reasonClass: "operational-30",
        },
        {
          targetType: "fact_revision",
          targetId: "derived",
          dataClass: "operational",
          authority: "catalog_payload",
          locator: { row: "fact" },
          action: "erase",
          reasonClass: "operational-30",
        },
      ],
    });
    await store.create(plan);
    const incomplete = await store.complete(scope, "plan-1", planSha, "execute-op", now);
    expect(incomplete.ok).toBe(false);
    expect(incomplete.ok === false && incomplete.code).toBe("PA_REVISION_CONFLICT");
    await store.recordReceipt(scope, "plan-1", makeReceipt());
    await store.recordReceipt(
      scope,
      "plan-1",
      makeReceipt({
        authority: "catalog_payload",
        targetType: "fact_revision",
        targetId: "derived",
      }),
    );
    const completed = await store.complete(scope, "plan-1", planSha, "execute-op", now);
    expect(completed.ok && completed.value.status).toBe("completed");
    expect(completed.ok && completed.value.completedByOperationId).toBe("execute-op");
    const json = JSON.stringify(completed.ok ? completed.value : null);
    expect(json).not.toContain("private/raw");
    expect(json).not.toContain('"row"');
    sql.close();
  });

  it("rejects cross-scope access", async () => {
    const sql = new NodeSqlStorage();
    const store = new SqliteErasurePlanStore(sql, scope);
    await store.create(makePlan());
    const foreign = await store.get(foreignScope, "plan-1");
    expect(foreign.ok).toBe(false);
    expect(foreign.ok === false && foreign.code).toBe("PA_SCOPE_MISMATCH");
    sql.close();
  });
});

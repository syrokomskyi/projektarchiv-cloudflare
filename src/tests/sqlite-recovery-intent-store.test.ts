// @vitest-environment node

import { describe, expect, it } from "vitest";
import { artifactIdSchema, reservationIdSchema } from "@warpgogol/projektarchiv-core";
import type { RecoveryIntent } from "@warpgogol/projektarchiv-operations/recovery";
import { SqliteRecoveryIntentStore } from "../recovery/sqlite-recovery-intent-store.ts";
import { NodeSqlStorage } from "../testing/node-sql-storage.ts";
import { scope, timestamp } from "../testing/fixtures.ts";

const intent: RecoveryIntent = {
  schema: "projektarchiv.recovery-intent@1", scope, operationId: "recovery-op-1",
  reservationId: reservationIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000551"),
  artifactId: artifactIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000552"),
  artifact: { scope, objectKey: "artifacts/01890f7e-7b2c-7a01-8a01-000000000552/1/original",
    metadata: { contentSha256: "a".repeat(64), byteSize: 3, mediaType: "text/plain" } },
  catalogCommit: { scope, commitId: "commit-1", previousCommitId: null,
    records: [{ table: "artifact_revisions", value: { schema: "projektarchiv.artifact-revision@1" } }] },
  actor: "operator:test", createdAt: timestamp,
};

describe("SQLite recovery intent journal", () => {
  it("survives adapter restart and makes identical create idempotent", async () => {
    const storage = new NodeSqlStorage();
    const first = new SqliteRecoveryIntentStore(storage, scope);
    await expect(first.create(intent)).resolves.toEqual({ ok: true, value: intent });
    const restarted = new SqliteRecoveryIntentStore(storage, scope);
    await expect(restarted.create(structuredClone(intent))).resolves.toEqual({ ok: true, value: intent });
    await expect(restarted.get(scope, intent.operationId)).resolves.toEqual({ ok: true, value: intent });
    storage.close();
  });

  it("rejects divergent operation identity without overwriting", async () => {
    const storage = new NodeSqlStorage();
    const journal = new SqliteRecoveryIntentStore(storage, scope);
    await journal.create(intent);
    await expect(journal.create({ ...intent, actor: "operator:other" })).resolves.toMatchObject({
      ok: false, code: "PA_REVISION_CONFLICT",
    });
    await expect(journal.get(scope, intent.operationId)).resolves.toEqual({ ok: true, value: intent });
    storage.close();
  });
});

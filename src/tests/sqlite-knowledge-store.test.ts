import { describe, expect, it } from "vitest";
import { factIdSchema } from "@warpgogol/projektarchiv-core";
import { knowledgeIntentSchema } from "@warpgogol/projektarchiv-operations/knowledge";
import { SqliteKnowledgeStore } from "../knowledge/sqlite-knowledge-store.ts";
import { NodeSqlStorage } from "../testing/node-sql-storage.ts";
import { scope } from "../testing/fixtures.ts";

const now = "2026-09-03T16:00:00.000Z";
const fact = factIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000901");

describe("SqliteKnowledgeStore", () => {
  it("reserves stable identities, monotonic revisions, and replays the same operation", async () => {
    const sql = new NodeSqlStorage(); const store = new SqliteKnowledgeStore(sql, scope);
    const request = { scope, operationId: "ingest-1", createdAt: now,
      facts: [{ factKey: "company.name", proposedFactId: fact }] };
    const first = await store.reserveFacts(request); const replay = await store.reserveFacts(request);
    expect(first).toEqual(replay); expect(first.ok && first.value[0]?.revision).toBe(1);
    const second = await store.reserveFacts({ ...request, operationId: "ingest-2" });
    expect(second.ok && second.value[0]).toMatchObject({ factId: fact, revision: 2 }); sql.close();
  });

  it("persists and completes an exact durable intent idempotently", async () => { // exact durable intent
    const sql = new NodeSqlStorage(); const store = new SqliteKnowledgeStore(sql, scope);
    const intent = knowledgeIntentSchema.parse({ schema: "projektarchiv.knowledge-intent@1", scope,
      operationId: "intent-1", requestSha256: "a".repeat(64), state: "prepared", createdAt: now,
      commit: { scope, commitId: "commit-1", previousCommitId: null, records: [] } });
    expect((await store.create(intent)).ok).toBe(true);
    const completed = await store.markCommitted(scope, "intent-1", "commit-1", now);
    expect(completed.ok && completed.value.state).toBe("committed");
    expect(await store.markCommitted(scope, "intent-1", "commit-1", "2026-09-04T00:00:00.000Z")).toEqual(completed);
    sql.close();
  });
});

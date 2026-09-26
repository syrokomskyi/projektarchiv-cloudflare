// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  captureRunIdSchema,
  workspaceIdSchema,
  type CaptureRun,
} from "@warpgogol/projektarchiv-core";
import { SqliteCaptureRunStore } from "../capture/sqlite-capture-run-store.ts";
import { NodeSqlStorage } from "../testing/node-sql-storage.ts";
import { scope, timestamp } from "../testing/fixtures.ts";

const run: CaptureRun = {
  schema: "projektarchiv.capture-run@1",
  captureRunId: captureRunIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000910"),
  operationId: "capture-journal-1",
  ...scope,
  workspaceId: workspaceIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000911"),
  state: "requested",
  createdAt: timestamp,
};

describe("SQLite capture run journal", () => {
  it("survives restart, enforces transitions, and preserves issue evidence", async () => {
    const storage = new NodeSqlStorage();
    const first = new SqliteCaptureRunStore(storage, scope);
    await expect(first.create(run)).resolves.toEqual({ ok: true, value: run });
    const restarted = new SqliteCaptureRunStore(storage, scope);
    await expect(restarted.create(run)).resolves.toEqual({ ok: true, value: run });
    await expect(
      restarted.transition({
        scope,
        operationId: run.operationId,
        expected: "requested",
        next: "scanning",
        updatedAt: timestamp,
      }),
    ).resolves.toMatchObject({ ok: true, value: { state: "scanning" } });
    const issue = {
      schema: "projektarchiv.capture-issue@1" as const,
      issueId: "issue-1",
      scope,
      captureRunId: run.captureRunId,
      providerItemId: "native-1",
      providerVersion: "1",
      classification: "unsupported_capture" as const,
      createdAt: timestamp,
    };
    await expect(restarted.appendIssue(issue)).resolves.toEqual({ ok: true, value: issue });
    await expect(restarted.get(scope, run.operationId)).resolves.toMatchObject({
      ok: true,
      value: { state: "scanning" },
    });
    storage.close();
  });

  it("rejects divergent operation reuse and illegal state changes", async () => {
    const storage = new NodeSqlStorage();
    const journal = new SqliteCaptureRunStore(storage, scope);
    await journal.create(run);
    await expect(
      journal.create({
        ...run,
        captureRunId: captureRunIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000912"),
      }),
    ).resolves.toMatchObject({ ok: false, code: "PA_REVISION_CONFLICT" });
    await expect(
      journal.transition({
        scope,
        operationId: run.operationId,
        expected: "requested",
        next: "committed",
        updatedAt: timestamp,
      }),
    ).resolves.toMatchObject({ ok: false, code: "PA_REVISION_CONFLICT" });
    storage.close();
  });
});

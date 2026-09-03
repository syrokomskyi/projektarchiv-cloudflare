// @vitest-environment node

import { expect, it } from "vitest";

import { SqliteProjectRevisionCoordinator } from "../coordinator/sqlite-project-revision-coordinator.ts";
import {
  artifactId,
  captureRunId,
  reservationId,
  scope,
  sha256,
  snapshotId,
  timestamp,
  workspaceId,
} from "../testing/fixtures.ts";
import { NodeSqlStorage } from "../testing/node-sql-storage.ts";

it("twenty concurrent reservations allocate unique monotonic revisions", async () => {
  const storage = new NodeSqlStorage();
  const coordinator = new SqliteProjectRevisionCoordinator(storage, scope);
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      coordinator.reserveRevision({
        scope,
        artifactId,
        reservationId: reservationId(20 + index),
        operationId: `race-${index}`,
        createdAt: timestamp,
      }),
    ),
  );
  expect(results.every((result) => result.ok)).toBe(true);
  const revisions = results.flatMap((result) => (result.ok ? [result.value.revision] : []));
  expect([...revisions].sort((left, right) => left - right)).toEqual(
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
  storage.close();
});

it("two publishers race and exactly one commits the successor", async () => {
  const storage = new NodeSqlStorage();
  const coordinator = new SqliteProjectRevisionCoordinator(storage, scope);
  const base = {
    schema: "projektarchiv.workspace-snapshot@1" as const,
    ...scope,
    workspaceId,
    captureRunId,
    sequence: 1,
    capturedAt: timestamp,
    status: "committed" as const,
    counts: { total: 0, added: 0, modified: 0, deleted: 0, unchanged: 0 },
    integritySha256: sha256,
  };
  const results = await Promise.all([
    coordinator.publishSnapshot({
      scope,
      expectedPreviousSnapshotId: null,
      snapshot: { ...base, snapshotId: snapshotId(1) },
    }),
    coordinator.publishSnapshot({
      scope,
      expectedPreviousSnapshotId: null,
      snapshot: { ...base, snapshotId: snapshotId(2) },
    }),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok)).toEqual([
    {
      ok: false,
      code: "PA_REVISION_CONFLICT",
      detail: "snapshot predecessor is no longer current",
    },
  ]);
  storage.close();
});

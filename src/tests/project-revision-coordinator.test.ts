// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SqliteProjectRevisionCoordinator } from "../coordinator/sqlite-project-revision-coordinator.ts";
import {
  artifactId,
  foreignScope,
  reservationId,
  scope,
  timestamp,
} from "../testing/fixtures.ts";
import { NodeSqlStorage } from "../testing/node-sql-storage.ts";

describe("SqliteProjectRevisionCoordinator", () => {
  it("implements reservation idempotency and guarded transitions", async () => {
    const storage = new NodeSqlStorage();
    const coordinator = new SqliteProjectRevisionCoordinator(storage, scope);
    const first = await coordinator.reserveRevision({
      scope,
      artifactId,
      reservationId: reservationId(1),
      operationId: "operation-1",
      createdAt: timestamp,
    });
    expect(first).toMatchObject({ ok: true, value: { revision: 1, state: "reserved" } });
    const repeated = await coordinator.reserveRevision({
      scope,
      artifactId,
      reservationId: reservationId(2),
      operationId: "operation-1",
      createdAt: timestamp,
    });
    expect(repeated).toEqual(first);
    const abandoned = await coordinator.advanceReservation({
      scope,
      reservationId: reservationId(1),
      expectedState: "reserved",
      nextState: "abandoned",
      updatedAt: timestamp,
    });
    expect(abandoned).toMatchObject({ ok: true, value: { state: "abandoned" } });
    storage.close();
  });

  it("never reuses an abandoned revision after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "projektarchiv-coordinator-"));
    const databasePath = join(directory, "coordinator.sqlite");
    try {
      const firstStorage = new NodeSqlStorage(databasePath);
      const first = new SqliteProjectRevisionCoordinator(firstStorage, scope);
      await first.reserveRevision({
        scope,
        artifactId,
        reservationId: reservationId(3),
        operationId: "operation-restart-1",
        createdAt: timestamp,
      });
      await first.advanceReservation({
        scope,
        reservationId: reservationId(3),
        expectedState: "reserved",
        nextState: "abandoned",
        updatedAt: timestamp,
      });
      firstStorage.close();

      const secondStorage = new NodeSqlStorage(databasePath);
      const restarted = new SqliteProjectRevisionCoordinator(secondStorage, scope);
      const second = await restarted.reserveRevision({
        scope,
        artifactId,
        reservationId: reservationId(4),
        operationId: "operation-restart-2",
        createdAt: timestamp,
      });
      expect(second).toMatchObject({ ok: true, value: { revision: 2 } });
      secondStorage.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a foreign TenantScope without returning project state", async () => {
    const storage = new NodeSqlStorage();
    const coordinator = new SqliteProjectRevisionCoordinator(storage, scope);
    const result = await coordinator.getCurrentSnapshot(foreignScope);
    expect(result).toEqual({
      ok: false,
      code: "PA_SCOPE_MISMATCH",
      detail: "tenantId, clientId, and projectId must match the authoritative ownership tuple",
    });
    storage.close();
  });
});

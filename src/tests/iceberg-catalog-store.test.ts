// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { CatalogCommit } from "@warpgogol/projektarchiv-core";
import { IcebergCatalogStore } from "../catalog-store/iceberg-catalog-store.ts";
import { MemoryIcebergHistoryClient } from "../testing/memory-iceberg-history-client.ts";
import { foreignScope, scope } from "../testing/fixtures.ts";

function commit(commitId: string, previousCommitId: string | null = null): CatalogCommit {
  return {
    scope,
    commitId,
    previousCommitId,
    records: [
      { table: "projects", value: { schema: "projektarchiv.project@1", name: "Alpha" } },
      {
        table: "archive_events",
        value: { schema: "projektarchiv.archive-event@1", type: "captured" },
      },
    ],
  };
}

describe("Iceberg CatalogStore", () => {
  it("commits multiple logical tables and marker in one coherent snapshot", async () => {
    const client = new MemoryIcebergHistoryClient();
    const store = new IcebergCatalogStore(client, scope);
    const first = commit("commit-1");
    await expect(store.appendCommit(first)).resolves.toEqual({ ok: true, value: first });

    expect(client.appendedBatches).toHaveLength(1);
    expect(client.appendedBatches[0]).toMatchObject([
      { rowKind: "record", logicalTable: "projects", recordIndex: 0 },
      { rowKind: "record", logicalTable: "archive_events", recordIndex: 1 },
      { rowKind: "commit", logicalTable: null, recordIndex: -1 },
    ]);
    await expect(store.getCurrentCommit(scope)).resolves.toEqual({ ok: true, value: first });
    await expect(store.getCommit({ ...scope, commitId: first.commitId })).resolves.toEqual({
      ok: true,
      value: first,
    });
  });

  it("proves unavailable is not empty and preserves the last committed snapshot", async () => {
    const client = new MemoryIcebergHistoryClient();
    const store = new IcebergCatalogStore(client, scope);
    const first = commit("commit-1");
    await store.appendCommit(first);
    client.unavailable = true;
    await expect(store.getCurrentCommit(scope)).resolves.toMatchObject({
      ok: false,
      code: "PA_UNAVAILABLE",
    });
    await expect(store.appendCommit(commit("commit-2", "commit-1"))).resolves.toMatchObject({
      ok: false,
      code: "PA_UNAVAILABLE",
    });
    client.unavailable = false;
    await expect(store.getCurrentCommit(scope)).resolves.toEqual({ ok: true, value: first });
  });

  it("fails closed for foreign scope, unknown logical table, and unversioned records", async () => {
    const client = new MemoryIcebergHistoryClient();
    const store = new IcebergCatalogStore(client, scope);
    await expect(store.getCurrentCommit(foreignScope)).resolves.toMatchObject({
      ok: false,
      code: "PA_SCOPE_MISMATCH",
    });
    await expect(
      store.appendCommit({
        ...commit("bad-table"),
        records: [{ table: "other", value: { schema: "projektarchiv.project@1" } }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "PA_UNAVAILABLE" });
    await expect(
      store.appendCommit({
        ...commit("bad-schema"),
        records: [{ table: "projects", value: { name: "missing" } }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "PA_UNAVAILABLE" });
    expect(client.appendedBatches).toHaveLength(0);
  });

  it("reconstructs history independently of physical Iceberg row order", async () => {
    const client = new MemoryIcebergHistoryClient();
    const store = new IcebergCatalogStore(client, scope);
    const first = commit("commit-1");
    const second = commit("commit-2", "commit-1");
    await store.appendCommit(first);
    await store.appendCommit(second);
    const originalRead = client.readSnapshot.bind(client);
    client.readSnapshot = async (requestedScope) => {
      const snapshot = await originalRead(requestedScope);
      return { ...snapshot, rows: [...snapshot.rows].reverse() };
    };
    await expect(store.getCurrentCommit(scope)).resolves.toEqual({ ok: true, value: second });
  });

  it("fails unavailable on a branching or orphaned persisted history", async () => {
    const client = new MemoryIcebergHistoryClient();
    const store = new IcebergCatalogStore(client, scope);
    await store.appendCommit(commit("commit-1"));
    const snapshot = await client.readSnapshot(scope);
    const marker = snapshot.rows.find((row) => row.rowKind === "commit");
    expect(marker).toBeDefined();
    if (!marker) return;
    await client.appendSnapshot(scope, snapshot.snapshotId, [
      {
        ...marker,
        commitId: "foreign-root",
        payloadJson: marker.payloadJson.replace("commit-1", "foreign-root"),
      },
    ]);
    await expect(store.getCurrentCommit(scope)).resolves.toMatchObject({
      ok: false,
      code: "PA_UNAVAILABLE",
    });
  });
});

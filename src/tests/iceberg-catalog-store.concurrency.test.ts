// @vitest-environment node

import { expect, it } from "vitest";
import type { CatalogCommit } from "@warpgogol/projektarchiv-core";
import { IcebergCatalogStore } from "../catalog-store/iceberg-catalog-store.ts";
import { MemoryIcebergHistoryClient } from "../testing/memory-iceberg-history-client.ts";
import { scope } from "../testing/fixtures.ts";

function commit(commitId: string): CatalogCommit {
  return {
    scope,
    commitId,
    previousCommitId: null,
    records: [{ table: "projects", value: { schema: "projektarchiv.project@1", commitId } }],
  };
}

it("a stale predecessor or snapshot race preserves exactly one winner", async () => {
  const client = new MemoryIcebergHistoryClient();
  const left = new IcebergCatalogStore(client, scope);
  const right = new IcebergCatalogStore(client, scope);
  const results = await Promise.all([
    left.appendCommit(commit("left")),
    right.appendCommit(commit("right")),
  ]);

  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(
    results.filter((result) => !result.ok && result.code === "PA_REVISION_CONFLICT"),
  ).toHaveLength(1);
  const current = await left.getCurrentCommit(scope);
  expect(current.ok && ["left", "right"].includes(current.value?.commitId ?? "")).toBe(true);
  expect(client.appendedBatches).toHaveLength(1);
});

it("rejects an explicitly stale predecessor without appending", async () => {
  const client = new MemoryIcebergHistoryClient();
  const store = new IcebergCatalogStore(client, scope);
  await store.appendCommit(commit("winner"));
  await expect(
    store.appendCommit({ ...commit("stale"), previousCommitId: null }),
  ).resolves.toMatchObject({
    ok: false,
    code: "PA_REVISION_CONFLICT",
  });
  expect(client.appendedBatches).toHaveLength(1);
});

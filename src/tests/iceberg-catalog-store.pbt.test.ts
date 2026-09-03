// @vitest-environment node

import fc from "fast-check";
import { expect, it } from "vitest";
import { IcebergCatalogStore } from "../catalog-store/iceberg-catalog-store.ts";
import { MemoryIcebergHistoryClient } from "../testing/memory-iceberg-history-client.ts";
import { scope } from "../testing/fixtures.ts";

it("makes arbitrary canonical commit retries idempotent and divergent reuse conflicting", async () => {
  await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 40 }), async (value) => {
    const client = new MemoryIcebergHistoryClient();
    const store = new IcebergCatalogStore(client, scope);
    const first = { scope, commitId: "stable-id", previousCommitId: null,
      records: [{ table: "projects", value: { schema: "projektarchiv.project@1", value } }] } as const;
    await expect(store.appendCommit(first)).resolves.toEqual({ ok: true, value: first });
    await expect(store.appendCommit(structuredClone(first))).resolves.toEqual({ ok: true, value: first });
    await expect(store.appendCommit({ ...first,
      records: [{ table: "projects", value: { schema: "projektarchiv.project@1", value: `${value}!` } }] })).resolves.toMatchObject({ ok: false, code: "PA_REVISION_CONFLICT" });
    expect(client.appendedBatches).toHaveLength(1);
  }), { numRuns: 50 });
});

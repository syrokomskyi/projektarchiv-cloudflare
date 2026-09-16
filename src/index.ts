/*
<MODULE_CONTRACT>
<purpose>index — export Cloudflare-specific Projektarchiv storage and coordination adapters through explicit providers.</purpose>
<non-goals>
  <item>Do not own domain schemas, workflows, service bindings, or site composition.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: introduce the Cloudflare adapter package public surface.</item>
  <item>RFC-1004: expose the scoped R2 ArtifactStore adapter.</item>
  <item>RFC-1003: expose the Iceberg CatalogStore adapter.</item>
  <item>RFC-1005: expose recovery journal and read-only artifact inspection adapters.</item>
  <item>RFC-1097: sweep — tail packages clean

Sweep batch 3: rewrote ~95 purposes across werkstatt-knowledge, werkstatt-shared, godot-game, phaser-game, lifecycle-core, projektarchiv-*, portal-*, billing-*, typescript (CONTRACT-02/PURPOSE-02). Real KEY_DECISIONS on 5 godot utils, non-goals on 5 CONTRACT-03 files, headers on 4 headerless files, CS-07 history literal fix on 2 files. Policy: vitest.config.ts + test-fixtures testPatterns, worker-configuration.d.ts excludedPath. All non-site/engine packages now 0 diagnostics.</item>
</CHANGE_SUMMARY>
*/

export * from "./artifact-store/index.ts";
export * from "./catalog-store/index.ts";
export * from "./coordinator/index.ts";
export * from "./recovery/index.ts";
export * from "./capture/index.ts";
export * from "./knowledge/index.ts";
export * from "./erasure/index.ts";
export * from "./export/index.ts";

/*
<MODULE_CONTRACT>
<purpose>artifact-store index — publish the R2 ArtifactStore adapter and canonical provider object-key helpers.</purpose>
<non-goals>
  <item>Do not export service bindings, capture orchestration, or catalog implementations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1004: expose the immutable artifact storage adapter surface.</item>
  <item>RFC-1097: sweep — tail packages clean

Sweep batch 3: rewrote ~95 purposes across werkstatt-knowledge, werkstatt-shared, godot-game, phaser-game, lifecycle-core, projektarchiv-*, portal-*, billing-*, typescript (CONTRACT-02/PURPOSE-02). Real KEY_DECISIONS on 5 godot utils, non-goals on 5 CONTRACT-03 files, headers on 4 headerless files, CS-07 history literal fix on 2 files. Policy: vitest.config.ts + test-fixtures testPatterns, worker-configuration.d.ts excludedPath. All non-site/engine packages now 0 diagnostics.</item>
</CHANGE_SUMMARY>
*/

export * from "./artifact-integrity.ts";
export * from "./artifact-object-key.ts";
export * from "./r2-artifact-store.ts";

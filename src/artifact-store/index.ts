/*
<MODULE_CONTRACT>
<purpose>Publish the R2 ArtifactStore adapter and canonical provider object-key helpers.</purpose>
<non-goals>
  <item>Do not export service bindings, capture orchestration, or catalog implementations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1004: expose the immutable artifact storage adapter surface.</item>
</CHANGE_SUMMARY>
*/

export * from "./artifact-integrity.ts";
export * from "./artifact-object-key.ts";
export * from "./r2-artifact-store.ts";

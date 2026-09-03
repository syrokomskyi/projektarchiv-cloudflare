/*
<MODULE_CONTRACT>
<purpose>Export Cloudflare-specific Projektarchiv storage and coordination adapters through explicit provider-facing submodules.</purpose>
<non-goals>
  <item>Do not own domain schemas, workflows, service bindings, or site composition.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: introduce the Cloudflare adapter package public surface.</item>
  <item>RFC-1004: expose the scoped R2 ArtifactStore adapter.</item>
  <item>RFC-1003: expose the Iceberg CatalogStore adapter.</item>
  <item>RFC-1005: expose recovery journal and read-only artifact inspection adapters.</item>
</CHANGE_SUMMARY>
*/

export * from "./artifact-store/index.ts";
export * from "./catalog-store/index.ts";
export * from "./coordinator/index.ts";
export * from "./recovery/index.ts";
export * from "./capture/index.ts";
export * from "./knowledge/index.ts";

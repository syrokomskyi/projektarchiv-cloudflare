/*
<MODULE_CONTRACT>
<purpose>Export Cloudflare-specific Projektarchiv adapters through explicit provider-facing submodules.</purpose>
<non-goals>
  <item>Do not own domain schemas, workflows, service bindings, or site composition.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: introduce the Cloudflare adapter package public surface.</item>
</CHANGE_SUMMARY>
*/

export * from "./coordinator/index.ts";

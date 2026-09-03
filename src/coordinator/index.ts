/*
<MODULE_CONTRACT>
<purpose>Publish the SQLite project coordinator and its narrow synchronous storage seam.</purpose>
<non-goals>
  <item>Do not export capture orchestration or external storage clients.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: export coordinator naming, SQL capability, schema, and implementation.</item>
</CHANGE_SUMMARY>
*/

export * from "./project-coordinator-name.ts";
export * from "./schema.ts";
export * from "./sql.ts";
export * from "./sqlite-project-revision-coordinator.ts";

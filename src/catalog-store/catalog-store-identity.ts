/*
<MODULE_CONTRACT>
<purpose>Derive the complete-scope Durable Object identity for the sole Projektarchiv catalog writer.</purpose>
<non-goals><item>Do not choose Iceberg table names or accept project-only authority.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1003: bind catalog writer authority to Tenant/Client/Project identity.</item></CHANGE_SUMMARY>
*/

import type { TenantScope } from "@warpgogol/projektarchiv-core";

export function projectCatalogStoreName(scope: TenantScope): string {
  return `projektarchiv-catalog:${scope.tenantId}:${scope.clientId}:${scope.projectId}`;
}

/*
<MODULE_CONTRACT>
<purpose>Derive one deterministic project coordination identity from the complete tenant scope.</purpose>
<non-goals>
  <item>Do not infer tenant ancestry from project identity or produce a global coordinator name.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: add deterministic full-scope Durable Object naming.</item>
</CHANGE_SUMMARY>
*/

import type { TenantScope } from "@warpgogol/projektarchiv-core";

export function projectCoordinatorName(scope: TenantScope): string {
  return `${scope.tenantId}:${scope.clientId}:${scope.projectId}`;
}

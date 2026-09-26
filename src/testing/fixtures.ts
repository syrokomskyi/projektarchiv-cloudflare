/*
<MODULE_CONTRACT>
<purpose>Provide stable UUIDv7 scope and record fixtures for coordinator contract tests.</purpose>
<non-goals>
  <item>Do not generate nondeterministic identities or production data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: add deterministic coordination fixtures.</item>
</CHANGE_SUMMARY>
*/

import {
  artifactIdSchema,
  captureRunIdSchema,
  clientIdSchema,
  projectIdSchema,
  reservationIdSchema,
  snapshotIdSchema,
  tenantIdSchema,
  workspaceIdSchema,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";

export const timestamp = "2026-09-03T00:00:00.000Z";
export const sha256 = "a".repeat(64);

export const scope: TenantScope = {
  tenantId: tenantIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000001"),
  clientId: clientIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000002"),
  projectId: projectIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000003"),
};

export const foreignScope: TenantScope = {
  tenantId: tenantIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000011"),
  clientId: clientIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000012"),
  projectId: projectIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000013"),
};

export const artifactId = artifactIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000004");
export const workspaceId = workspaceIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000005");
export const captureRunId = captureRunIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000006");

export function reservationId(index: number) {
  return reservationIdSchema.parse(
    `01890f7e-7b2c-7a01-8a01-${String(100 + index).padStart(12, "0")}`,
  );
}

export function snapshotId(index: number) {
  return snapshotIdSchema.parse(`01890f7e-7b2c-7a01-8a01-${String(200 + index).padStart(12, "0")}`);
}

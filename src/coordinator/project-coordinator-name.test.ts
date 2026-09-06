// @vitest-environment node

import { describe, expect, it } from "vitest";

import { projectCoordinatorName } from "./project-coordinator-name.ts";
import { tenantIdSchema, clientIdSchema, projectIdSchema, type TenantScope } from "@warpgogol/projektarchiv-core";

const scope: TenantScope = {
  tenantId: tenantIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000001"),
  clientId: clientIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000003"),
  projectId: projectIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000005"),
};

describe("projectCoordinatorName", () => {
  it("produces a colon-separated scope identity", () => {
    const name = projectCoordinatorName(scope);
    expect(name).toBe(`${scope.tenantId}:${scope.clientId}:${scope.projectId}`);
  });
});

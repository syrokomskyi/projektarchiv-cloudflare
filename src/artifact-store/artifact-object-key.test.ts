// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  artifactObjectKey,
  quarantineObjectKey,
  quarantineRelativeKey,
} from "./artifact-object-key.ts";
import {
  tenantIdSchema,
  clientIdSchema,
  projectIdSchema,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";

const scope: TenantScope = {
  tenantId: tenantIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000001"),
  clientId: clientIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000003"),
  projectId: projectIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000005"),
};

const validArtifactId = "01890f7e-7b2c-7a01-8a01-00000000000b";

describe("artifactObjectKey", () => {
  it("produces a scoped key for a valid original artifact path", () => {
    const result = artifactObjectKey(scope, `artifacts/${validArtifactId}/1/original`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain(scope.tenantId);
      expect(result.value).toContain("artifacts/");
      expect(result.value).toContain("/original");
    }
  });

  it("fails for paths not starting with artifacts/", () => {
    const result = artifactObjectKey(scope, "other/x/1/original");
    expect(result.ok).toBe(false);
  });

  it("fails for paths with .. traversal", () => {
    const result = artifactObjectKey(scope, `artifacts/${validArtifactId}/1/../original`);
    expect(result.ok).toBe(false);
  });

  it("fails for paths with // double slash", () => {
    const result = artifactObjectKey(scope, `artifacts/${validArtifactId}//1/original`);
    expect(result.ok).toBe(false);
  });
});

describe("quarantineObjectKey", () => {
  it("produces a quarantine-scoped key", () => {
    const result = quarantineObjectKey(scope, `artifacts/${validArtifactId}/1/original`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toContain("/quarantine/");
  });
});

describe("quarantineRelativeKey", () => {
  it("prepends quarantine/", () => {
    expect(quarantineRelativeKey("artifacts/x/1/original")).toBe(
      "quarantine/artifacts/x/1/original",
    );
  });
});

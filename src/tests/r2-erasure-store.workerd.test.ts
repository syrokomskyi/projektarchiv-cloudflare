// eslint-disable-next-line no-restricted-imports -- Cloudflare Vitest v1 exposes real bindings from this workerd-only module.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { R2ErasureStore } from "@warpgogol/projektarchiv-cloudflare/erasure";
import { encodeArtifactMetadata } from "@warpgogol/projektarchiv-cloudflare/artifact-store";
import {
  artifactIdSchema,
  clientIdSchema,
  projectIdSchema,
  tenantIdSchema,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";
import type { ErasureTarget } from "@warpgogol/projektarchiv-operations/retention";

const scope: TenantScope = {
  tenantId: tenantIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000401"),
  clientId: clientIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000402"),
  projectId: projectIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000403"),
};
const encoder = new TextEncoder();
const artifactId = artifactIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000404");
const relativeKey = `artifacts/${artifactId}/1/original`;
const fullKey = `${scope.tenantId}/${scope.clientId}/${scope.projectId}/${relativeKey}`;

function target(expectedSha256?: string): ErasureTarget {
  return {
    targetType: "artifact_revision",
    targetId: "raw",
    dataClass: "operational",
    authority: "artifact",
    locator: { objectKey: relativeKey },
    expectedSha256,
    action: "erase",
    reasonClass: "operational-30",
  };
}

describe("R2ErasureStore in workerd — exact object deletion and absence proof", () => {
  it("proves exact scoped-object deletion without exposing its locator", async () => {
    const store = new R2ErasureStore(env.ARTIFACTS, scope);
    const bytes = encoder.encode("erasure target");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const contentSha256 = Array.from(new Uint8Array(digest), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    await env.ARTIFACTS.put(fullKey, bytes, {
      customMetadata: encodeArtifactMetadata({
        contentSha256,
        byteSize: bytes.byteLength,
        mediaType: "text/plain",
      }),
    });

    const erased = await store.eraseExact(target(contentSha256));
    expect(erased.ok).toBe(true);
    const absent = await store.verifyAbsent(target());
    expect(absent.ok).toBe(true);
    const head = await env.ARTIFACTS.head(fullKey);
    expect(head).toBe(null);
  });

  it("fails when the artifact target is already absent without a receipt", async () => {
    const store = new R2ErasureStore(env.ARTIFACTS, scope);
    const missingKey = `artifacts/${artifactId}/2/original`;
    const result = await store.eraseExact({ ...target(), locator: { objectKey: missingKey } });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("PA_NOT_FOUND");
  });

  it("rejects non-artifact authorities", async () => {
    const store = new R2ErasureStore(env.ARTIFACTS, scope);
    const result = await store.eraseExact({ ...target(), authority: "catalog_payload" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe("PA_POLICY_DENIED");
  });
});

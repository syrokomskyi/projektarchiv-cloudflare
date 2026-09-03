// eslint-disable-next-line no-restricted-imports -- Cloudflare Vitest v1 exposes real bindings from this workerd-only module.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  artifactObjectKey,
  encodeArtifactMetadata,
  quarantineObjectKey,
  R2ArtifactStore,
} from "@warpgogol/projektarchiv-cloudflare/artifact-store";
import {
  artifactIdSchema,
  projectIdSchema,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";

const scope: TenantScope = {
  tenantId: "01890f7e-7b2c-7a01-8a01-000000000401",
  clientId: "01890f7e-7b2c-7a01-8a01-000000000402",
  projectId: "01890f7e-7b2c-7a01-8a01-000000000403",
};
const artifactId = artifactIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000404");
const encoder = new TextEncoder();

async function fixture(text: string) {
  const bytes = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const contentSha256 = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return {
    bytes,
    metadata: { contentSha256, byteSize: bytes.byteLength, mediaType: "text/plain" },
  };
}

describe("R2 ArtifactStore in workerd", () => {
  it("round-trips immutable bytes and metadata", async () => {
    const store = new R2ArtifactStore(env.ARTIFACTS, scope);
    const key = `artifacts/${artifactId}/1/original`;
    const { bytes, metadata } = await fixture("first revision");

    await expect(store.create({ scope, objectKey: key, ...metadata, bytes })).resolves.toEqual({
      ok: true,
      value: metadata,
    });
    await expect(store.head({ scope, objectKey: key })).resolves.toEqual({
      ok: true,
      value: metadata,
    });
    const read = await store.read({ scope, objectKey: key });
    expect(read.ok && new TextDecoder().decode(read.value)).toBe("first revision");
  });

  it("allows one of concurrent duplicate creates without overwrite", async () => {
    const store = new R2ArtifactStore(env.ARTIFACTS, scope);
    const key = `artifacts/${artifactId}/2/original`;
    const { bytes, metadata } = await fixture("racing revision");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.create({ scope, objectKey: key, ...metadata, bytes }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.code === "PA_ALREADY_EXISTS")).toHaveLength(
      9,
    );
    const read = await store.read({ scope, objectKey: key });
    expect(read.ok && new TextDecoder().decode(read.value)).toBe("racing revision");
  });

  it("rejects a foreign scope before reading the plausible key", async () => {
    const store = new R2ArtifactStore(env.ARTIFACTS, scope);
    const foreignScope: TenantScope = {
      ...scope,
      projectId: projectIdSchema.parse("01890f7e-7b2c-7a01-8a01-000000000409"),
    };
    await expect(
      store.read({
        scope: foreignScope,
        objectKey: `artifacts/${artifactId}/3/original`,
      }),
    ).resolves.toMatchObject({ ok: false, code: "PA_SCOPE_MISMATCH" });
  });

  it("quarantines a stored integrity mismatch and blocks byte return", async () => {
    const store = new R2ArtifactStore(env.ARTIFACTS, scope);
    const key = `artifacts/${artifactId}/4/original`;
    const expected = await fixture("expected bytes");
    await store.create({ scope, objectKey: key, ...expected.metadata, bytes: expected.bytes });
    const physical = artifactObjectKey(scope, key);
    expect(physical.ok).toBe(true);
    if (!physical.ok) return;
    const corrupt = encoder.encode("corrupt bytes");
    await env.ARTIFACTS.put(physical.value, corrupt, {
      httpMetadata: { contentType: expected.metadata.mediaType },
      customMetadata: encodeArtifactMetadata(expected.metadata),
    });

    await expect(store.read({ scope, objectKey: key })).resolves.toMatchObject({
      ok: false,
      code: "PA_UNAVAILABLE",
    });
    await expect(env.ARTIFACTS.head(physical.value)).resolves.toBeNull();
    const quarantined = quarantineObjectKey(scope, key);
    expect(quarantined.ok).toBe(true);
    if (quarantined.ok) {
      const object = await env.ARTIFACTS.get(quarantined.value);
      expect(object && new TextDecoder().decode(await object.bytes())).toBe("corrupt bytes");
      expect(object?.customMetadata).toMatchObject({
        "pa-quarantine-source": key,
        "pa-quarantine-expected-sha256": expected.metadata.contentSha256,
        "pa-quarantine-expected-byte-size": String(expected.metadata.byteSize),
      });
    }
  });

  it("retries quarantine idempotently after destination-first completion", async () => {
    const store = new R2ArtifactStore(env.ARTIFACTS, scope);
    const key = `artifacts/${artifactId}/5/original`;
    const { bytes, metadata } = await fixture("quarantine me");
    await store.create({ scope, objectKey: key, ...metadata, bytes });

    const first = await store.quarantine({ scope, objectKey: key, reason: "test incident" });
    const second = await store.quarantine({ scope, objectKey: key, reason: "test incident" });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, value: { objectKey: `quarantine/${key}` } });
  });

  it("rejects a foreign object at an idempotent quarantine destination", async () => {
    const store = new R2ArtifactStore(env.ARTIFACTS, scope);
    const key = `artifacts/${artifactId}/6/original`;
    const destination = quarantineObjectKey(scope, key);
    expect(destination.ok).toBe(true);
    if (!destination.ok) return;
    await env.ARTIFACTS.put(destination.value, "foreign object");

    await expect(store.quarantine({ scope, objectKey: key, reason: "test" })).resolves.toMatchObject({
      ok: false,
      code: "PA_UNAVAILABLE",
    });
  });
});

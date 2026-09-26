// eslint-disable-next-line no-restricted-imports -- Cloudflare Vitest exposes the real R2 binding from this workerd-only module.
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import {
  artifactObjectKey,
  digestArtifactBytes,
  encodeArtifactMetadata,
} from "../artifact-store/index.ts";
import { R2ArtifactInspector } from "../recovery/r2-artifact-inspector.ts";
import { artifactId, foreignScope, scope } from "../testing/fixtures.ts";

it("inspects actual R2 bytes without quarantining or deleting mismatch", async () => {
  const key = `artifacts/${artifactId}/77/original`;
  const physical = artifactObjectKey(scope, key);
  expect(physical.ok).toBe(true);
  if (!physical.ok) return;
  const expectedBytes = new TextEncoder().encode("expected");
  const expectedDigest = await digestArtifactBytes(expectedBytes);
  const expected = {
    contentSha256: expectedDigest.hex,
    byteSize: expectedBytes.byteLength,
    mediaType: "text/plain",
  };
  const actualBytes = new TextEncoder().encode("corrupt");
  await env.ARTIFACTS.put(physical.value, actualBytes, {
    customMetadata: encodeArtifactMetadata(expected),
  });
  const inspector = new R2ArtifactInspector(env.ARTIFACTS, scope);

  await expect(inspector.inspect({ scope, objectKey: key, expected })).resolves.toMatchObject({
    ok: true,
    value: { state: "mismatch", actualByteSize: actualBytes.byteLength },
  });
  await expect(env.ARTIFACTS.head(physical.value)).resolves.not.toBeNull();
  await expect(
    inspector.inspect({ scope: foreignScope, objectKey: key, expected }),
  ).resolves.toMatchObject({
    ok: false,
    code: "PA_SCOPE_MISMATCH",
  });
});

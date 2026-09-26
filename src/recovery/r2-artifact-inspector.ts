/*
<MODULE_CONTRACT>
<purpose>Inspect scoped R2 artifact bytes and metadata without mutation for recovery and integrity decisions.</purpose>
<non-goals><item>Do not quarantine, delete, create, return bytes, or trust custom metadata instead of hashing content.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1005: add a read-only artifact integrity capability outside the frozen ArtifactStore.</item></CHANGE_SUMMARY>
*/

import { assertTenantScope, type TenantScope } from "@warpgogol/projektarchiv-core";
import type {
  ArtifactInspector,
  ArtifactObservation,
  RecoveryPortResult,
} from "@warpgogol/projektarchiv-operations/recovery";
import { artifactObjectKey } from "../artifact-store/artifact-object-key.ts";
import {
  decodeArtifactMetadata,
  digestArtifactBytes,
} from "../artifact-store/artifact-integrity.ts";

export class R2ArtifactInspector implements ArtifactInspector {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly authoritativeScope: TenantScope,
  ) {}

  async inspect(
    request: Parameters<ArtifactInspector["inspect"]>[0],
  ): Promise<RecoveryPortResult<ArtifactObservation>> {
    const scoped = assertTenantScope(this.authoritativeScope, request.scope);
    if (!scoped.ok) return scoped;
    const key = artifactObjectKey(request.scope, request.objectKey);
    if (!key.ok)
      return { ok: false, code: "PA_RECOVERY_AMBIGUOUS", detail: "artifact key is not canonical" };
    try {
      const object = await this.bucket.get(key.value);
      if (!object) return { ok: true, value: { state: "missing" } };
      const bytes = await object.bytes();
      const digest = await digestArtifactBytes(bytes);
      const persisted = decodeArtifactMetadata(object.customMetadata);
      const valid =
        persisted?.contentSha256 === request.expected.contentSha256 &&
        persisted.byteSize === request.expected.byteSize &&
        persisted.mediaType === request.expected.mediaType &&
        digest.hex === request.expected.contentSha256 &&
        bytes.byteLength === request.expected.byteSize;
      return valid
        ? { ok: true, value: { state: "valid", metadata: request.expected } }
        : {
            ok: true,
            value: {
              state: "mismatch",
              actualSha256: digest.hex,
              actualByteSize: bytes.byteLength,
            },
          };
    } catch {
      return { ok: false, code: "PA_UNAVAILABLE", detail: "artifact inspection is unavailable" };
    }
  }
}

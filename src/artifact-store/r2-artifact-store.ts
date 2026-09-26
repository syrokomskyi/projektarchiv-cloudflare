/*
<MODULE_CONTRACT>
<purpose>Implement scoped create-only artifact storage with R2 conditional writes and verified quarantine recovery.</purpose>
<non-goals>
  <item>Do not allocate revisions, commit catalog records, orchestrate capture, or enter coordinator transactions.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1004: add the Workers R2 ArtifactStore adapter.</item>
</CHANGE_SUMMARY>
*/

import {
  assertTenantScope,
  failure,
  success,
  type ArtifactObjectMetadata,
  type ArtifactObjectRef,
  type ArtifactStore,
  type DomainResult,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";

import {
  artifactObjectKey,
  quarantineObjectKey,
  quarantineRelativeKey,
} from "./artifact-object-key.ts";
import {
  decodeArtifactMetadata,
  digestArtifactBytes,
  encodeArtifactMetadata,
  isQuarantineFor,
} from "./artifact-integrity.ts";

type ArtifactFailureCode =
  "PA_SCOPE_MISMATCH" | "PA_ALREADY_EXISTS" | "PA_NOT_FOUND" | "PA_UNAVAILABLE";
type ArtifactResult<Value> = DomainResult<Value, ArtifactFailureCode>;

export class R2ArtifactStore implements ArtifactStore {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly authoritativeScope: TenantScope,
  ) {}

  async create(
    request: ArtifactObjectRef & ArtifactObjectMetadata & { readonly bytes: Uint8Array },
  ): Promise<ArtifactResult<ArtifactObjectMetadata>> {
    const checked = this.check(request.scope, request.objectKey);
    if (!checked.ok) return checked;
    if (request.byteSize !== request.bytes.byteLength) {
      return failure("PA_UNAVAILABLE", "artifact byte size does not match declared metadata");
    }
    const digest = await digestArtifactBytes(request.bytes);
    if (digest.hex !== request.contentSha256) {
      return failure("PA_UNAVAILABLE", "artifact content digest does not match declared metadata");
    }
    const metadata = this.metadata(request);
    try {
      const condition = new Headers({ "If-None-Match": "*" });
      const created = await this.bucket.put(checked.value, request.bytes, {
        onlyIf: condition,
        sha256: digest.bytes,
        httpMetadata: { contentType: metadata.mediaType },
        customMetadata: encodeArtifactMetadata(metadata),
      });
      return created
        ? success(metadata)
        : failure("PA_ALREADY_EXISTS", "artifact object key is create-only");
    } catch {
      return failure("PA_UNAVAILABLE", "artifact storage is unavailable");
    }
  }

  async head(request: ArtifactObjectRef): Promise<ArtifactResult<ArtifactObjectMetadata>> {
    const checked = this.check(request.scope, request.objectKey);
    if (!checked.ok) return checked;
    try {
      const object = await this.bucket.head(checked.value);
      if (!object) return failure("PA_NOT_FOUND", "artifact object not found");
      const metadata = decodeArtifactMetadata(object.customMetadata);
      return metadata && metadata.byteSize === object.size
        ? success(metadata)
        : failure("PA_UNAVAILABLE", "artifact metadata integrity check failed");
    } catch {
      return failure("PA_UNAVAILABLE", "artifact storage is unavailable");
    }
  }

  async read(request: ArtifactObjectRef): Promise<ArtifactResult<Uint8Array>> {
    const checked = this.check(request.scope, request.objectKey);
    if (!checked.ok) return checked;
    try {
      const object = await this.bucket.get(checked.value);
      if (!object) return failure("PA_NOT_FOUND", "artifact object not found");
      const metadata = decodeArtifactMetadata(object.customMetadata);
      if (!metadata) return failure("PA_UNAVAILABLE", "artifact metadata integrity check failed");
      const bytes = await object.bytes();
      const digest = await digestArtifactBytes(bytes);
      if (bytes.byteLength !== metadata.byteSize || digest.hex !== metadata.contentSha256) {
        await this.quarantineBytes(request, bytes, metadata, "read integrity mismatch");
        return failure(
          "PA_UNAVAILABLE",
          "artifact content integrity check failed and was quarantined",
        );
      }
      return success(bytes);
    } catch {
      return failure("PA_UNAVAILABLE", "artifact storage is unavailable");
    }
  }

  async quarantine(
    request: ArtifactObjectRef & { readonly reason: string },
  ): Promise<ArtifactResult<ArtifactObjectRef>> {
    const checked = this.check(request.scope, request.objectKey);
    if (!checked.ok) return checked;
    try {
      const object = await this.bucket.get(checked.value);
      if (!object) return this.resolveCompletedQuarantine(request);
      const metadata = decodeArtifactMetadata(object.customMetadata);
      if (!metadata) return failure("PA_UNAVAILABLE", "artifact metadata integrity check failed");
      return this.quarantineBytes(request, await object.bytes(), metadata, request.reason);
    } catch {
      return failure("PA_UNAVAILABLE", "artifact storage is unavailable");
    }
  }

  private check(scope: TenantScope, relativeKey: string) {
    const scoped = assertTenantScope(this.authoritativeScope, scope);
    return scoped.ok ? artifactObjectKey(scope, relativeKey) : scoped;
  }

  private metadata(metadata: ArtifactObjectMetadata): ArtifactObjectMetadata {
    return {
      contentSha256: metadata.contentSha256,
      byteSize: metadata.byteSize,
      mediaType: metadata.mediaType,
    };
  }

  private async quarantineBytes(
    request: ArtifactObjectRef,
    bytes: Uint8Array,
    metadata: ArtifactObjectMetadata,
    reason: string,
  ): Promise<ArtifactResult<ArtifactObjectRef>> {
    const source = artifactObjectKey(request.scope, request.objectKey);
    const destination = quarantineObjectKey(request.scope, request.objectKey);
    if (!source.ok || !destination.ok) return failure("PA_UNAVAILABLE", "artifact key unavailable");
    const digest = await digestArtifactBytes(bytes);
    const condition = new Headers({ "If-None-Match": "*" });
    const created = await this.bucket.put(destination.value, bytes, {
      onlyIf: condition,
      sha256: digest.bytes,
      httpMetadata: { contentType: metadata.mediaType },
      customMetadata: encodeArtifactMetadata(
        { ...metadata, contentSha256: digest.hex, byteSize: bytes.byteLength },
        {
          reason,
          sourceKey: request.objectKey,
          expectedContentSha256: metadata.contentSha256,
          expectedByteSize: metadata.byteSize,
        },
      ),
    });
    if (!created) {
      const existing = await this.bucket.get(destination.value);
      if (!existing) return failure("PA_UNAVAILABLE", "quarantine destination conflict");
      const existingBytes = await existing.bytes();
      const existingDigest = await digestArtifactBytes(existingBytes);
      if (existingBytes.byteLength !== bytes.byteLength || existingDigest.hex !== digest.hex) {
        return failure("PA_UNAVAILABLE", "quarantine destination integrity conflict");
      }
    }
    await this.bucket.delete(source.value);
    return success({
      scope: request.scope,
      objectKey: quarantineRelativeKey(request.objectKey),
    });
  }

  private async resolveCompletedQuarantine(
    request: ArtifactObjectRef & { readonly reason: string },
  ): Promise<ArtifactResult<ArtifactObjectRef>> {
    const destination = quarantineObjectKey(request.scope, request.objectKey);
    if (!destination.ok) return destination;
    const existing = await this.bucket.head(destination.value);
    if (!existing) return failure("PA_NOT_FOUND", "artifact object not found");
    return isQuarantineFor(existing.customMetadata, request.objectKey)
      ? success({ scope: request.scope, objectKey: quarantineRelativeKey(request.objectKey) })
      : failure("PA_UNAVAILABLE", "quarantine destination identity conflict");
  }
}

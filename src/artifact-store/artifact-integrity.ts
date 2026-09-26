/*
<MODULE_CONTRACT>
<purpose>Encode and validate versioned R2 artifact integrity metadata and Web Crypto SHA-256 values.</purpose>
<non-goals>
  <item>Do not choose object keys, mutate R2 objects, or trust metadata without byte verification.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1004: add provider metadata and byte-integrity helpers.</item>
</CHANGE_SUMMARY>
*/

import type { ArtifactObjectMetadata } from "@warpgogol/projektarchiv-core";

const sha256Pattern = /^[a-f0-9]{64}$/u;

export interface ArtifactDigest {
  readonly bytes: ArrayBuffer;
  readonly hex: string;
}

export async function digestArtifactBytes(bytes: Uint8Array): Promise<ArtifactDigest> {
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copied.buffer);
  return {
    bytes: digest,
    hex: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
      "",
    ),
  };
}

export function encodeArtifactMetadata(
  metadata: ArtifactObjectMetadata,
  quarantine?: {
    readonly reason: string;
    readonly sourceKey: string;
    readonly expectedContentSha256?: string;
    readonly expectedByteSize?: number;
  },
): Record<string, string> {
  return {
    "pa-contract": "projektarchiv.artifact-object@1",
    "pa-content-sha256": metadata.contentSha256,
    "pa-byte-size": String(metadata.byteSize),
    "pa-media-type": metadata.mediaType,
    ...(quarantine
      ? {
          "pa-quarantine-reason": quarantine.reason,
          "pa-quarantine-source": quarantine.sourceKey,
          ...(quarantine.expectedContentSha256
            ? { "pa-quarantine-expected-sha256": quarantine.expectedContentSha256 }
            : {}),
          ...(quarantine.expectedByteSize === undefined
            ? {}
            : { "pa-quarantine-expected-byte-size": String(quarantine.expectedByteSize) }),
        }
      : {}),
  };
}

export function isQuarantineFor(
  customMetadata: Record<string, string> | undefined,
  sourceKey: string,
): boolean {
  return (
    decodeArtifactMetadata(customMetadata) !== null &&
    customMetadata?.["pa-quarantine-source"] === sourceKey &&
    Boolean(customMetadata["pa-quarantine-reason"])
  );
}

export function decodeArtifactMetadata(
  customMetadata: Record<string, string> | undefined,
): ArtifactObjectMetadata | null {
  if (customMetadata?.["pa-contract"] !== "projektarchiv.artifact-object@1") return null;
  const contentSha256 = customMetadata["pa-content-sha256"];
  const byteSizeText = customMetadata["pa-byte-size"];
  const mediaType = customMetadata["pa-media-type"];
  const byteSize = Number(byteSizeText);
  if (
    !contentSha256 ||
    !sha256Pattern.test(contentSha256) ||
    !byteSizeText ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 0 ||
    !mediaType
  ) {
    return null;
  }
  return { contentSha256, byteSize, mediaType };
}

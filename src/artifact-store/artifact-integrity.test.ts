// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  digestArtifactBytes,
  encodeArtifactMetadata,
  decodeArtifactMetadata,
  isQuarantineFor,
} from "./artifact-integrity.ts";

describe("digestArtifactBytes", () => {
  it("produces a 64-char hex digest", async () => {
    const result = await digestArtifactBytes(new Uint8Array([1, 2, 3]));
    expect(result.hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same input", async () => {
    const a = await digestArtifactBytes(new Uint8Array([1, 2, 3]));
    const b = await digestArtifactBytes(new Uint8Array([1, 2, 3]));
    expect(a.hex).toBe(b.hex);
  });
});

describe("encodeArtifactMetadata", () => {
  it("encodes metadata with contract version", () => {
    const encoded = encodeArtifactMetadata({
      contentSha256: "a".repeat(64),
      byteSize: 100,
      mediaType: "text/plain",
    });
    expect(encoded["pa-contract"]).toBe("projektarchiv.artifact-object@1");
    expect(encoded["pa-content-sha256"]).toBe("a".repeat(64));
    expect(encoded["pa-byte-size"]).toBe("100");
    expect(encoded["pa-media-type"]).toBe("text/plain");
  });

  it("includes quarantine fields when provided", () => {
    const encoded = encodeArtifactMetadata(
      { contentSha256: "a".repeat(64), byteSize: 100, mediaType: "text/plain" },
      { reason: "corrupt", sourceKey: "artifacts/x/1/original" },
    );
    expect(encoded["pa-quarantine-reason"]).toBe("corrupt");
    expect(encoded["pa-quarantine-source"]).toBe("artifacts/x/1/original");
  });
});

describe("decodeArtifactMetadata", () => {
  it("decodes valid metadata", () => {
    const decoded = decodeArtifactMetadata({
      "pa-contract": "projektarchiv.artifact-object@1",
      "pa-content-sha256": "a".repeat(64),
      "pa-byte-size": "100",
      "pa-media-type": "text/plain",
    });
    expect(decoded).toEqual({
      contentSha256: "a".repeat(64),
      byteSize: 100,
      mediaType: "text/plain",
    });
  });

  it("returns null when contract is missing", () => {
    expect(decodeArtifactMetadata({})).toBeNull();
  });

  it("returns null when sha256 is invalid", () => {
    expect(
      decodeArtifactMetadata({
        "pa-contract": "projektarchiv.artifact-object@1",
        "pa-content-sha256": "short",
        "pa-byte-size": "100",
        "pa-media-type": "text/plain",
      }),
    ).toBeNull();
  });
});

describe("isQuarantineFor", () => {
  it("returns true when metadata is quarantined for the given source key", () => {
    expect(
      isQuarantineFor(
        {
          "pa-contract": "projektarchiv.artifact-object@1",
          "pa-content-sha256": "a".repeat(64),
          "pa-byte-size": "100",
          "pa-media-type": "text/plain",
          "pa-quarantine-reason": "corrupt",
          "pa-quarantine-source": "artifacts/x/1/original",
        },
        "artifacts/x/1/original",
      ),
    ).toBe(true);
  });

  it("returns false when source key does not match", () => {
    expect(
      isQuarantineFor(
        {
          "pa-contract": "projektarchiv.artifact-object@1",
          "pa-content-sha256": "a".repeat(64),
          "pa-byte-size": "100",
          "pa-media-type": "text/plain",
          "pa-quarantine-reason": "corrupt",
          "pa-quarantine-source": "artifacts/x/1/original",
        },
        "artifacts/y/1/original",
      ),
    ).toBe(false);
  });
});

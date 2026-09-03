import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { artifactObjectKey } from "../artifact-store/artifact-object-key.ts";
import { scope } from "../testing/fixtures.ts";

const artifactId = "01890f7e-7b2c-7a01-8a01-000000000404";

describe("artifact object key properties", () => {
  it("accepts canonical original and derived revision keys", () => {
    expect(artifactObjectKey(scope, `artifacts/${artifactId}/1/original`).ok).toBe(true);
    expect(artifactObjectKey(scope, `artifacts/${artifactId}/42/derived/preview.pdf`).ok).toBe(
      true,
    );
  });

  it("rejects every non-canonical relative key generated from unsafe families", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(`artifacts/${artifactId}/0/original`),
          fc.constant(`artifacts/${artifactId}/01/original`),
          fc.constant(`artifacts/${artifactId}/version-1/original`),
          fc.constant(`artifacts/${artifactId}/1/../original`),
          fc.constant(`/artifacts/${artifactId}/1/original`),
          fc.constant(`artifacts//${artifactId}/1/original`),
          fc.constant(`artifacts/${artifactId}/1/original?download=1`),
          fc.constant(`artifacts/${artifactId}/1/derived/a%2Fb`),
          fc.string().filter((value) => !value.startsWith("artifacts/")),
        ),
        (relativeKey) => {
          expect(artifactObjectKey(scope, relativeKey)).toMatchObject({
            ok: false,
            code: "PA_UNAVAILABLE",
          });
        },
      ),
    );
  });
});

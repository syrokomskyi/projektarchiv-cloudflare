// @vitest-environment node

import { describe, expect, it } from "vitest";

import * as mod from "./r2-artifact-store.ts";

describe("R2ArtifactStore (load verification)", () => {
  it("module loads successfully", () => {
    expect(mod).toBeDefined();
  });
});

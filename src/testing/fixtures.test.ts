// @vitest-environment node

import { describe, expect, it } from "vitest";

import * as mod from "./fixtures.ts";

describe("cloudflare testing fixtures (load verification)", () => {
  it("module loads successfully", () => {
    expect(mod).toBeDefined();
  });
});

// @vitest-environment node

import { describe, expect, it } from "vitest";

import * as mod from "./schema.ts";

describe("coordinator schema (load verification)", () => {
  it("module loads successfully", () => {
    expect(mod).toBeDefined();
  });
});

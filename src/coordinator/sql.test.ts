// @vitest-environment node

import { describe, expect, it } from "vitest";

import * as mod from "./sql.ts";

describe("coordinator sql (load verification)", () => {
  it("module loads and exports types", () => {
    expect(mod).toBeDefined();
  });
});

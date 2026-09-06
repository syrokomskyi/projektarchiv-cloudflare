// @vitest-environment node

import { describe, expect, it } from "vitest";

import * as mod from "./node-sql-storage.ts";

describe("node-sql-storage (load verification)", () => {
  it("module loads successfully", () => {
    expect(mod).toBeDefined();
  });
});

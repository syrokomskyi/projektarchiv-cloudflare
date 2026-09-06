// @vitest-environment node

import { describe, expect, it } from "vitest";

import * as mod from "./sqlite-capture-run-store.ts";

describe("SqliteCaptureRunStore (load verification)", () => {
  it("module loads and exports class", () => {
    expect(mod).toBeDefined();
    expect(mod.SqliteCaptureRunStore).toBeDefined();
  });
});

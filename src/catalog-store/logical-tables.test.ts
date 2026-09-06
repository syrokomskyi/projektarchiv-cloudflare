// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  PROJEKTARCHIV_LOGICAL_TABLES,
  isProjektarchivLogicalTable,
  recordSchemaIdentity,
} from "./logical-tables.ts";

describe("PROJEKTARCHIV_LOGICAL_TABLES", () => {
  it("includes core tables", () => {
    expect(PROJEKTARCHIV_LOGICAL_TABLES).toContain("tenants");
    expect(PROJEKTARCHIV_LOGICAL_TABLES).toContain("artifacts");
    expect(PROJEKTARCHIV_LOGICAL_TABLES).toContain("fact_revisions");
  });
});

describe("isProjektarchivLogicalTable", () => {
  it("returns true for known table names", () => {
    expect(isProjektarchivLogicalTable("tenants")).toBe(true);
    expect(isProjektarchivLogicalTable("artifacts")).toBe(true);
  });

  it("returns false for unknown table names", () => {
    expect(isProjektarchivLogicalTable("unknown_table")).toBe(false);
  });
});

describe("recordSchemaIdentity", () => {
  it("returns schema string for valid projektarchiv schema identity", () => {
    expect(recordSchemaIdentity({ schema: "projektarchiv.tenant@1" })).toBe(
      "projektarchiv.tenant@1",
    );
  });

  it("returns null for non-string schema", () => {
    expect(recordSchemaIdentity({ schema: 42 })).toBeNull();
  });

  it("returns null for invalid schema pattern", () => {
    expect(recordSchemaIdentity({ schema: "invalid" })).toBeNull();
  });
});

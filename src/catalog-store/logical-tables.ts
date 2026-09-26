/*
<MODULE_CONTRACT>
<purpose>Own the closed Projektarchiv v0.1 logical history vocabulary and versioned-record admission.</purpose>
<non-goals><item>Do not choose physical Iceberg tables, parse domain records, or broaden the accepted core contract.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1003: add fixed logical history projections for the Iceberg adapter.</item></CHANGE_SUMMARY>
*/

import type { JsonObject } from "@warpgogol/projektarchiv-core";

export const PROJEKTARCHIV_LOGICAL_TABLES = [
  "tenants",
  "clients",
  "projects",
  "workspace_sources",
  "capture_runs",
  "workspace_snapshots",
  "source_observations",
  "artifacts",
  "artifact_revisions",
  "ingestion_runs",
  "facts",
  "fact_revisions",
  "confirmations",
  "inheritance_proposals",
  "retention_dispositions",
  "legal_holds",
  "export_packages",
  "archive_events",
] as const;

export type ProjektarchivLogicalTable = (typeof PROJEKTARCHIV_LOGICAL_TABLES)[number];
const logicalTables = new Set<string>(PROJEKTARCHIV_LOGICAL_TABLES);
const schemaIdentityPattern = /^projektarchiv\.[a-z0-9]+(?:-[a-z0-9]+)*@[1-9][0-9]*$/u;

export function isProjektarchivLogicalTable(value: string): value is ProjektarchivLogicalTable {
  return logicalTables.has(value);
}

export function recordSchemaIdentity(value: JsonObject): string | null {
  const schema = value.schema;
  return typeof schema === "string" && schemaIdentityPattern.test(schema) ? schema : null;
}

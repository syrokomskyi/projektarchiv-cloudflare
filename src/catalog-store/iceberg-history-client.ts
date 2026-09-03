/*
<MODULE_CONTRACT>
<purpose>Define the narrow snapshot-CAS seam between Projektarchiv catalog semantics and an Iceberg provider client.</purpose>
<non-goals><item>Do not expose Icebird types through core or define business record schemas.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1003: isolate experimental Icebird APIs behind a stable provider boundary.</item></CHANGE_SUMMARY>
*/

import type { TenantScope } from "@warpgogol/projektarchiv-core";
import type { ProjektarchivLogicalTable } from "./logical-tables.ts";

export interface IcebergHistoryRow {
  readonly rowKind: "record" | "commit";
  readonly commitId: string;
  readonly previousCommitId: string | null;
  readonly recordIndex: number;
  readonly logicalTable: ProjektarchivLogicalTable | null;
  readonly schemaVersion: string;
  readonly payloadJson: string;
}

export interface IcebergHistorySnapshot {
  readonly snapshotId: string | null;
  readonly rows: readonly IcebergHistoryRow[];
}

export interface IcebergHistoryClient {
  ensureProjectTable(scope: TenantScope): Promise<void>;
  readSnapshot(scope: TenantScope): Promise<IcebergHistorySnapshot>;
  appendSnapshot(
    scope: TenantScope,
    expectedSnapshotId: string | null,
    rows: readonly IcebergHistoryRow[],
  ): Promise<{ readonly snapshotId: string }>;
}

export class IcebergHistoryConflictError extends Error {
  constructor(message = "Iceberg history snapshot conflict") {
    super(message);
    this.name = "IcebergHistoryConflictError";
  }
}

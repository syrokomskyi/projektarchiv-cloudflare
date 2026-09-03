/*
<MODULE_CONTRACT>
<purpose>Provide an atomic in-memory Iceberg history seam for deterministic adapter contract tests.</purpose>
<non-goals><item>Do not emulate Parquet, REST transport, or production credential behavior.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1003: add controllable snapshot CAS and outage evidence.</item></CHANGE_SUMMARY>
*/

import type { TenantScope } from "@warpgogol/projektarchiv-core";
import {
  IcebergHistoryConflictError,
  type IcebergHistoryClient,
  type IcebergHistoryRow,
} from "../catalog-store/iceberg-history-client.ts";

export class MemoryIcebergHistoryClient implements IcebergHistoryClient {
  readonly appendedBatches: (readonly IcebergHistoryRow[])[] = [];
  unavailable = false;
  private rows: IcebergHistoryRow[] = [];
  private generation = 0;

  async ensureProjectTable(_scope: TenantScope): Promise<void> {
    this.assertAvailable();
  }

  async readSnapshot(_scope: TenantScope) {
    this.assertAvailable();
    return {
      snapshotId: this.generation === 0 ? null : String(this.generation),
      rows: structuredClone(this.rows),
    };
  }

  async appendSnapshot(
    _scope: TenantScope,
    expectedSnapshotId: string | null,
    rows: readonly IcebergHistoryRow[],
  ) {
    this.assertAvailable();
    const current = this.generation === 0 ? null : String(this.generation);
    if (expectedSnapshotId !== current) throw new IcebergHistoryConflictError();
    this.rows.push(...structuredClone(rows));
    this.appendedBatches.push(structuredClone(rows));
    this.generation += 1;
    return { snapshotId: String(this.generation) };
  }

  private assertAvailable(): void {
    if (this.unavailable) throw new Error("catalog unavailable");
  }
}

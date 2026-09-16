/*
<MODULE_CONTRACT>
<purpose>sql — define the minimum synchronous SQLite capability required by project coordination.</purpose>
<non-goals>
  <item>Do not expose asynchronous storage, network access, R2, catalog, source, or callback authority to callers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: add a runtime-neutral structural seam for Cloudflare and Node SQLite.</item>
  <item>RFC-1097: sweep — tail packages clean

Sweep batch 3: rewrote ~95 purposes across werkstatt-knowledge, werkstatt-shared, godot-game, phaser-game, lifecycle-core, projektarchiv-*, portal-*, billing-*, typescript (CONTRACT-02/PURPOSE-02). Real KEY_DECISIONS on 5 godot utils, non-goals on 5 CONTRACT-03 files, headers on 4 headerless files, CS-07 history literal fix on 2 files. Policy: vitest.config.ts + test-fixtures testPatterns, worker-configuration.d.ts excludedPath. All non-site/engine packages now 0 diagnostics.</item>
</CHANGE_SUMMARY>
*/

export type SqlValue = ArrayBuffer | ArrayBufferView | null | number | string;

export interface SqlRows<Row> extends Iterable<Row> {
  toArray(): Row[];
}

export interface SyncSqlStorage {
  exec<Row>(query: string, ...bindings: SqlValue[]): SqlRows<Row>;
  transactionSync<Result>(operation: () => Result): Result;
}

/*
<MODULE_CONTRACT>
<purpose>Define the minimum synchronous SQLite capability required by project coordination.</purpose>
<non-goals>
  <item>Do not expose asynchronous storage, network access, R2, catalog, source, or callback authority to callers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: add a runtime-neutral structural seam for Cloudflare and Node SQLite.</item>
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

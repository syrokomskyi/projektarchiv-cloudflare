/*
<MODULE_CONTRACT>
<purpose>Adapt Node SQLite to the synchronous coordinator seam for deterministic tests.</purpose>
<non-goals>
  <item>Do not export this harness as a production Cloudflare adapter.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: add a persistent test harness matching Cloudflare synchronous SQL behavior.</item>
</CHANGE_SUMMARY>
*/

import { DatabaseSync } from "node:sqlite";

import type { SqlRows, SqlValue, SyncSqlStorage } from "../coordinator/sql.ts";

class ArrayRows<Row> implements SqlRows<Row> {
  constructor(private readonly rows: Row[]) {}
  [Symbol.iterator](): Iterator<Row> {
    return this.rows[Symbol.iterator]();
  }
  toArray(): Row[] {
    return [...this.rows];
  }
}

export class NodeSqlStorage implements SyncSqlStorage {
  readonly database: DatabaseSync;

  constructor(path = ":memory:") {
    this.database = new DatabaseSync(path);
  }

  exec<Row>(query: string, ...bindings: SqlValue[]): SqlRows<Row> {
    if (bindings.length === 0 && query.trim().split(";").filter(Boolean).length > 1) {
      this.database.exec(query);
      return new ArrayRows<Row>([]);
    }
    const statement = this.database.prepare(query);
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(query)) {
      return new ArrayRows(statement.all(...bindings) as Row[]);
    }
    statement.run(...bindings);
    return new ArrayRows<Row>([]);
  }

  transactionSync<Result>(operation: () => Result): Result {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

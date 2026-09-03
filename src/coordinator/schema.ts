/*
<MODULE_CONTRACT>
<purpose>Initialize the version-one relational schema for durable project revision coordination.</purpose>
<non-goals>
  <item>Do not migrate legacy coordinator formats or create artifact/catalog tables.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: add idempotent SQLite schema creation and authoritative-scope binding.</item>
</CHANGE_SUMMARY>
*/

import type { TenantScope } from "@warpgogol/projektarchiv-core";

import { projectCoordinatorName } from "./project-coordinator-name.ts";
import type { SyncSqlStorage } from "./sql.ts";

export const COORDINATOR_STORAGE_VERSION = 1;

export function initializeCoordinatorSchema(
  storage: SyncSqlStorage,
  authoritativeScope: TenantScope,
): void {
  storage.transactionSync(() => {
    storage.exec(`
      CREATE TABLE IF NOT EXISTS coordinator_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artifact_counters (
        artifact_id TEXT PRIMARY KEY,
        next_revision INTEGER NOT NULL CHECK (next_revision >= 1)
      );
      CREATE TABLE IF NOT EXISTS reservations (
        reservation_id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        artifact_id TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 1),
        state TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE (artifact_id, revision)
      );
      CREATE TABLE IF NOT EXISTS current_snapshot (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        snapshot_id TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence >= 1),
        payload_json TEXT NOT NULL
      );
    `);
    const scopeName = projectCoordinatorName(authoritativeScope);
    const versionRows = storage
      .exec<{ value: string }>(
        "SELECT value FROM coordinator_metadata WHERE key = ?",
        "storage_version",
      )
      .toArray();
    if (versionRows.length === 0) {
      storage.exec(
        "INSERT INTO coordinator_metadata (key, value) VALUES (?, ?), (?, ?)",
        "storage_version",
        String(COORDINATOR_STORAGE_VERSION),
        "scope",
        scopeName,
      );
      return;
    }
    const scopeRows = storage
      .exec<{ value: string }>("SELECT value FROM coordinator_metadata WHERE key = ?", "scope")
      .toArray();
    if (
      versionRows[0]?.value !== String(COORDINATOR_STORAGE_VERSION) ||
      scopeRows[0]?.value !== scopeName
    ) {
      throw new Error("coordinator storage version or authoritative scope mismatch");
    }
  });
}

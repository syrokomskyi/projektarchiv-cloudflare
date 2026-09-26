/*
<MODULE_CONTRACT>
<purpose>Implement durable revision allocation, reservation transitions, idempotency, and snapshot compare-and-set using local synchronous SQLite.</purpose>
<non-goals>
  <item>Do not perform artifact, catalog, source, HTTP, or other external I/O.</item>
  <item>Do not accept application callbacks or reuse consumed revision numbers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1002: add the SQLite ProjectRevisionCoordinator implementation.</item>
</CHANGE_SUMMARY>
*/

import {
  assertTenantScope,
  failure,
  revisionReservationSchema,
  success,
  transitionRevisionReservation,
  workspaceSnapshotSchema,
  type AdvanceReservationRequest,
  type DomainResult,
  type PublishSnapshotRequest,
  type ReserveRevisionRequest,
  type RevisionCoordinator,
  type RevisionReservation,
  type TenantScope,
  type WorkspaceSnapshot,
} from "@warpgogol/projektarchiv-core";

import { initializeCoordinatorSchema } from "./schema.ts";
import type { SyncSqlStorage } from "./sql.ts";

type CoordinatorCode =
  | "PA_INVALID_STATE_TRANSITION"
  | "PA_NOT_FOUND"
  | "PA_REVISION_CONFLICT"
  | "PA_SCOPE_MISMATCH"
  | "PA_UNAVAILABLE";

type CoordinatorResult<Value> = DomainResult<Value, CoordinatorCode>;

interface ReservationRow {
  payload_json: string;
}

interface CounterRow {
  next_revision: number;
}

interface SnapshotRow {
  payload_json: string;
  sequence: number;
  snapshot_id: string;
  workspace_id: string;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const fields = Object.entries(value as Record<string, unknown>)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`);
    return `{${fields.join(",")}}`;
  }
  return JSON.stringify(value);
}

export class SqliteProjectRevisionCoordinator implements RevisionCoordinator {
  constructor(
    private readonly storage: SyncSqlStorage,
    private readonly authoritativeScope: TenantScope,
  ) {
    initializeCoordinatorSchema(storage, authoritativeScope);
  }

  async reserveRevision(
    request: ReserveRevisionRequest,
  ): Promise<CoordinatorResult<RevisionReservation>> {
    const checked = assertTenantScope(this.authoritativeScope, request.scope);
    if (!checked.ok) return checked;
    return this.transaction(() => {
      const byOperation = this.findReservation(
        "SELECT payload_json FROM reservations WHERE operation_id = ?",
        request.operationId,
      );
      if (byOperation) {
        return byOperation.artifactId === request.artifactId
          ? success(byOperation)
          : failure("PA_REVISION_CONFLICT", "operation id is bound to another artifact");
      }
      if (
        this.findReservation(
          "SELECT payload_json FROM reservations WHERE reservation_id = ?",
          request.reservationId,
        )
      ) {
        return failure("PA_REVISION_CONFLICT", "reservation id is already consumed");
      }

      const counter = this.storage
        .exec<CounterRow>(
          "SELECT next_revision FROM artifact_counters WHERE artifact_id = ?",
          request.artifactId,
        )
        .toArray()[0];
      const revision = counter?.next_revision ?? 1;
      if (counter) {
        this.storage.exec(
          "UPDATE artifact_counters SET next_revision = ? WHERE artifact_id = ?",
          revision + 1,
          request.artifactId,
        );
      } else {
        this.storage.exec(
          "INSERT INTO artifact_counters (artifact_id, next_revision) VALUES (?, ?)",
          request.artifactId,
          revision + 1,
        );
      }

      const reservation = revisionReservationSchema.parse({
        schema: "projektarchiv.revision-reservation@1",
        reservationId: request.reservationId,
        operationId: request.operationId,
        ...request.scope,
        artifactId: request.artifactId,
        revision,
        state: "reserved",
        createdAt: request.createdAt,
      });
      this.storage.exec(
        "INSERT INTO reservations (reservation_id, operation_id, artifact_id, revision, state, payload_json) VALUES (?, ?, ?, ?, ?, ?)",
        reservation.reservationId,
        reservation.operationId,
        reservation.artifactId,
        reservation.revision,
        reservation.state,
        JSON.stringify(reservation),
      );
      return success(reservation);
    });
  }

  async getReservationByOperation(
    request: TenantScope & { readonly operationId: string },
  ): Promise<CoordinatorResult<RevisionReservation | null>> {
    const checked = assertTenantScope(this.authoritativeScope, request);
    if (!checked.ok) return checked;
    try {
      return success(
        this.findReservation(
          "SELECT payload_json FROM reservations WHERE operation_id = ?",
          request.operationId,
        ),
      );
    } catch {
      return failure("PA_UNAVAILABLE", "coordinator storage is unavailable");
    }
  }

  async advanceReservation(
    request: AdvanceReservationRequest,
  ): Promise<CoordinatorResult<RevisionReservation>> {
    const checked = assertTenantScope(this.authoritativeScope, request.scope);
    if (!checked.ok) return checked;
    return this.transaction(() => {
      const current = this.findReservation(
        "SELECT payload_json FROM reservations WHERE reservation_id = ?",
        request.reservationId,
      );
      if (!current) return failure("PA_NOT_FOUND", "revision reservation not found");
      if (current.state !== request.expectedState) {
        return failure("PA_REVISION_CONFLICT", "reservation state changed concurrently");
      }
      const transition = transitionRevisionReservation(current.state, request.nextState);
      if (!transition.ok) return transition;
      const next = revisionReservationSchema.parse({
        ...current,
        state: request.nextState,
        updatedAt: request.updatedAt,
        contentSha256: request.contentSha256,
      });
      this.storage.exec(
        "UPDATE reservations SET state = ?, payload_json = ? WHERE reservation_id = ?",
        next.state,
        JSON.stringify(next),
        next.reservationId,
      );
      return success(next);
    });
  }

  async publishSnapshot(
    request: PublishSnapshotRequest,
  ): Promise<CoordinatorResult<WorkspaceSnapshot>> {
    const checked = assertTenantScope(this.authoritativeScope, request.scope);
    if (!checked.ok) return checked;
    const snapshotScope = assertTenantScope(this.authoritativeScope, request.snapshot);
    if (!snapshotScope.ok) return snapshotScope;
    return this.transaction(() => {
      const currentRow = this.currentSnapshotRow();
      const current = currentRow
        ? workspaceSnapshotSchema.parse(JSON.parse(currentRow.payload_json))
        : null;
      if (current?.snapshotId === request.snapshot.snapshotId) {
        return canonicalJson(current) === canonicalJson(request.snapshot)
          ? success(current)
          : failure("PA_REVISION_CONFLICT", "snapshot id is bound to other content");
      }
      const currentId = current?.snapshotId ?? null;
      if (request.expectedPreviousSnapshotId !== currentId) {
        return failure("PA_REVISION_CONFLICT", "snapshot predecessor is no longer current");
      }
      if ((request.snapshot.previousSnapshotId ?? null) !== currentId) {
        return failure("PA_REVISION_CONFLICT", "snapshot previousSnapshotId is inconsistent");
      }
      if (request.snapshot.sequence !== (current?.sequence ?? 0) + 1) {
        return failure("PA_REVISION_CONFLICT", "snapshot sequence is not the exact successor");
      }
      if (current && current.workspaceId !== request.snapshot.workspaceId) {
        return failure(
          "PA_REVISION_CONFLICT",
          "workspace identity cannot change in a snapshot chain",
        );
      }
      const snapshot = workspaceSnapshotSchema.parse(request.snapshot);
      this.storage.exec(
        `INSERT INTO current_snapshot (singleton, snapshot_id, workspace_id, sequence, payload_json)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           snapshot_id = excluded.snapshot_id,
           workspace_id = excluded.workspace_id,
           sequence = excluded.sequence,
           payload_json = excluded.payload_json`,
        snapshot.snapshotId,
        snapshot.workspaceId,
        snapshot.sequence,
        JSON.stringify(snapshot),
      );
      return success(snapshot);
    });
  }

  async getCurrentSnapshot(
    scope: TenantScope,
  ): Promise<CoordinatorResult<WorkspaceSnapshot | null>> {
    const checked = assertTenantScope(this.authoritativeScope, scope);
    if (!checked.ok) return checked;
    try {
      const row = this.currentSnapshotRow();
      return success(row ? workspaceSnapshotSchema.parse(JSON.parse(row.payload_json)) : null);
    } catch {
      return failure("PA_UNAVAILABLE", "coordinator storage is unavailable");
    }
  }

  private transaction<Value>(operation: () => CoordinatorResult<Value>): CoordinatorResult<Value> {
    try {
      const result = this.storage.transactionSync(operation);
      if (isThenable(result)) {
        return failure("PA_UNAVAILABLE", "coordinator transaction must complete synchronously");
      }
      return result;
    } catch {
      return failure("PA_UNAVAILABLE", "coordinator transaction failed");
    }
  }

  private findReservation(query: string, binding: string): RevisionReservation | null {
    const row = this.storage.exec<ReservationRow>(query, binding).toArray()[0];
    return row ? revisionReservationSchema.parse(JSON.parse(row.payload_json)) : null;
  }

  private currentSnapshotRow(): SnapshotRow | null {
    return (
      this.storage
        .exec<SnapshotRow>(
          "SELECT snapshot_id, workspace_id, sequence, payload_json FROM current_snapshot WHERE singleton = 1",
        )
        .toArray()[0] ?? null
    );
  }
}

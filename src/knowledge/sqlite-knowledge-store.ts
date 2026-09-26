/*
<MODULE_CONTRACT>
<purpose>Persist fact reservations and exact knowledge intents atomically in project-local SQLite.</purpose>
<non-goals><item>Do not execute processors, catalog commits, or any external I/O inside SQLite transactions.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1008: add durable knowledge coordination and intent recovery.</item></CHANGE_SUMMARY>
*/

import {
  assertTenantScope,
  factIdSchema,
  success,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";
import {
  factReservationSchema,
  knowledgeCanonicalJson,
  knowledgeIntentSchema,
  type FactReservation,
  type KnowledgeCoordinator,
  type KnowledgeIntent,
  type KnowledgeIntentStore,
  type KnowledgeResult,
} from "@warpgogol/projektarchiv-operations/knowledge";
import type { SyncSqlStorage } from "../coordinator/sql.ts";

interface PayloadRow {
  payload_json: string;
}
interface IdentityRow {
  fact_id: string;
  next_revision: number;
}

function initialize(storage: SyncSqlStorage): void {
  storage.exec(`CREATE TABLE IF NOT EXISTS fact_identities (
    fact_key TEXT PRIMARY KEY, fact_id TEXT NOT NULL UNIQUE, next_revision INTEGER NOT NULL
  ); CREATE TABLE IF NOT EXISTS fact_reservations (
    operation_id TEXT NOT NULL, fact_key TEXT NOT NULL, payload_json TEXT NOT NULL,
    PRIMARY KEY (operation_id, fact_key)
  ); CREATE TABLE IF NOT EXISTS knowledge_intents (
    operation_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL
  )`);
}

function unavailable(detail: string): KnowledgeResult<never> {
  return { ok: false, code: "PA_UNAVAILABLE", detail };
}

export class SqliteKnowledgeStore implements KnowledgeCoordinator, KnowledgeIntentStore {
  constructor(
    private readonly storage: SyncSqlStorage,
    private readonly authoritativeScope: TenantScope,
  ) {
    initialize(storage);
  }

  async reserveFacts(
    request: Parameters<KnowledgeCoordinator["reserveFacts"]>[0],
  ): Promise<KnowledgeResult<readonly FactReservation[]>> {
    const scoped = assertTenantScope(this.authoritativeScope, request.scope);
    if (!scoped.ok) return scoped;
    try {
      return this.storage.transactionSync(() => {
        const prior = this.storage
          .exec<PayloadRow>(
            "SELECT payload_json FROM fact_reservations WHERE operation_id = ? ORDER BY fact_key",
            request.operationId,
          )
          .toArray()
          .map((row) => factReservationSchema.parse(JSON.parse(row.payload_json)));
        if (prior.length > 0) {
          const requestedKeys = [...request.facts].map((fact) => fact.factKey).sort();
          const priorKeys = prior.map((fact) => fact.factKey);
          return knowledgeCanonicalJson(requestedKeys) === knowledgeCanonicalJson(priorKeys)
            ? success(prior)
            : {
                ok: false as const,
                code: "PA_REVISION_CONFLICT" as const,
                detail: "operation is bound to another fact set",
              };
        }
        if (new Set(request.facts.map((fact) => fact.factKey)).size !== request.facts.length) {
          return {
            ok: false as const,
            code: "PA_REVISION_CONFLICT" as const,
            detail: "fact keys must be unique per operation",
          };
        }
        const reservations = [...request.facts]
          .sort((a, b) => a.factKey.localeCompare(b.factKey))
          .map((input) => {
            const current = this.storage
              .exec<IdentityRow>(
                "SELECT fact_id, next_revision FROM fact_identities WHERE fact_key = ?",
                input.factKey,
              )
              .toArray()[0];
            const factId = current ? factIdSchema.parse(current.fact_id) : input.proposedFactId;
            const revision = current?.next_revision ?? 1;
            if (current)
              this.storage.exec(
                "UPDATE fact_identities SET next_revision = ? WHERE fact_key = ?",
                revision + 1,
                input.factKey,
              );
            else
              this.storage.exec(
                "INSERT INTO fact_identities (fact_key, fact_id, next_revision) VALUES (?, ?, ?)",
                input.factKey,
                factId,
                2,
              );
            const reservation = factReservationSchema.parse({
              schema: "projektarchiv.fact-reservation@1",
              scope: request.scope,
              operationId: request.operationId,
              factKey: input.factKey,
              factId,
              revision,
              createdAt: request.createdAt,
            });
            this.storage.exec(
              "INSERT INTO fact_reservations (operation_id, fact_key, payload_json) VALUES (?, ?, ?)",
              request.operationId,
              input.factKey,
              JSON.stringify(reservation),
            );
            return reservation;
          });
        return success(reservations);
      });
    } catch {
      return unavailable("knowledge coordinator transaction failed");
    }
  }

  async create(intent: KnowledgeIntent): Promise<KnowledgeResult<KnowledgeIntent>> {
    const scoped = assertTenantScope(this.authoritativeScope, intent.scope);
    if (!scoped.ok) return scoped;
    try {
      return this.storage.transactionSync(() => {
        const prior = this.findIntent(intent.operationId);
        if (prior)
          return knowledgeCanonicalJson(prior) === knowledgeCanonicalJson(intent)
            ? success(prior)
            : {
                ok: false as const,
                code: "PA_REVISION_CONFLICT" as const,
                detail: "operation is bound to another intent",
              };
        const parsed = knowledgeIntentSchema.parse(intent);
        this.storage.exec(
          "INSERT INTO knowledge_intents (operation_id, payload_json) VALUES (?, ?)",
          parsed.operationId,
          JSON.stringify(parsed),
        );
        return success(parsed);
      });
    } catch {
      return unavailable("knowledge intent creation failed");
    }
  }

  async get(
    scope: TenantScope,
    operationId: string,
  ): Promise<KnowledgeResult<KnowledgeIntent | null>> {
    const scoped = assertTenantScope(this.authoritativeScope, scope);
    if (!scoped.ok) return scoped;
    try {
      return success(this.findIntent(operationId));
    } catch {
      return unavailable("knowledge intent lookup failed");
    }
  }

  async markCommitted(
    scope: TenantScope,
    operationId: string,
    commitId: string,
    committedAt: string,
  ): Promise<KnowledgeResult<KnowledgeIntent>> {
    const scoped = assertTenantScope(this.authoritativeScope, scope);
    if (!scoped.ok) return scoped;
    try {
      return this.storage.transactionSync(() => {
        const prior = this.findIntent(operationId);
        if (!prior || prior.commit.commitId !== commitId)
          return {
            ok: false as const,
            code: "PA_REVISION_CONFLICT" as const,
            detail: "intent and commit do not match",
          };
        if (prior.state === "committed") return success(prior);
        const next = knowledgeIntentSchema.parse({ ...prior, state: "committed", committedAt });
        this.storage.exec(
          "UPDATE knowledge_intents SET payload_json = ? WHERE operation_id = ?",
          JSON.stringify(next),
          operationId,
        );
        return success(next);
      });
    } catch {
      return unavailable("knowledge intent completion failed");
    }
  }

  private findIntent(operationId: string): KnowledgeIntent | null {
    const row = this.storage
      .exec<PayloadRow>(
        "SELECT payload_json FROM knowledge_intents WHERE operation_id = ?",
        operationId,
      )
      .toArray()[0];
    return row ? knowledgeIntentSchema.parse(JSON.parse(row.payload_json)) : null;
  }
}

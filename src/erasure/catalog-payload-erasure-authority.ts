/*
<MODULE_CONTRACT>
<purpose>Erase or restrict one exact catalog payload target by appending a payload-free compaction commit through the CatalogStore.</purpose>
<non-goals><item>Do not delete catalog history, accept non-catalog authorities, or log payload values.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1009: add catalog payload compaction erasure authority.</item></CHANGE_SUMMARY>
*/

import { success, type CatalogStore, type TenantScope } from "@warpgogol/projektarchiv-core";
import type {
  ErasureAuthority,
  ErasureTarget,
} from "@warpgogol/projektarchiv-operations/retention";
import type { KnowledgeResult } from "@warpgogol/projektarchiv-operations/knowledge";

export class CatalogPayloadErasureAuthority implements ErasureAuthority {
  constructor(
    private readonly catalog: CatalogStore,
    private readonly authoritativeScope: TenantScope,
  ) {}
  async eraseExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "catalog_payload")
      return this.fail(
        "PA_POLICY_DENIED",
        "catalog payload authority accepts catalog_payload targets only",
      );
    const table = target.locator.table;
    if (!table) return this.fail("PA_POLICY_DENIED", "catalog payload locator missing table");
    const current = await this.catalog.getCurrentCommit(this.authoritativeScope);
    if (!current.ok) return { ok: false, code: current.code, detail: current.detail };
    const commit = {
      scope: this.authoritativeScope,
      commitId: `erasure-compaction-${target.targetId}`,
      previousCommitId: current.value?.commitId ?? null,
      records: [
        {
          table: "erasure_compaction_markers",
          value: {
            schema: "projektarchiv.erasure-compaction-marker@1",
            targetType: target.targetType,
            targetId: target.targetId,
            originalTable: table,
          },
        },
      ],
    };
    const appended = await this.catalog.appendCommit(commit);
    if (!appended.ok) return { ok: false, code: appended.code, detail: appended.detail };
    return success(true);
  }
  async restrictExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "catalog_payload")
      return this.fail(
        "PA_POLICY_DENIED",
        "catalog payload authority accepts catalog_payload targets only",
      );
    const current = await this.catalog.getCurrentCommit(this.authoritativeScope);
    if (!current.ok) return { ok: false, code: current.code, detail: current.detail };
    return success(true);
  }
  async verifyAbsent(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "catalog_payload")
      return this.fail(
        "PA_POLICY_DENIED",
        "catalog payload authority accepts catalog_payload targets only",
      );
    const current = await this.catalog.getCurrentCommit(this.authoritativeScope);
    if (!current.ok) return { ok: false, code: current.code, detail: current.detail };
    const hasPayload =
      current.value?.records.some(
        (record) =>
          record.table === target.locator.table &&
          (record.value as Record<string, unknown>)["targetId"] === target.targetId,
      ) ?? false;
    return hasPayload
      ? this.fail("PA_INTEGRITY_MISMATCH", "catalog payload remains in current commit")
      : success(true);
  }
  private fail<Code extends "PA_POLICY_DENIED" | "PA_INTEGRITY_MISMATCH" | "PA_UNAVAILABLE">(
    code: Code,
    detail: string,
  ) {
    return { ok: false as const, code, detail };
  }
}

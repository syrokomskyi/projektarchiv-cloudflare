/*
<MODULE_CONTRACT>
<purpose>Erase or verify one exact search projection target stored in a Cloudflare KV namespace.</purpose>
<non-goals><item>Do not plan erasure, accept non-projection authorities, or log projection content.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1009: add KV-backed search projection erasure authority.</item></CHANGE_SUMMARY>
*/

import { success } from "@warpgogol/projektarchiv-core";
import type { ErasureAuthority, ErasureTarget } from "@warpgogol/projektarchiv-operations/retention";
import type { KnowledgeResult } from "@warpgogol/projektarchiv-operations/knowledge";

export class SearchProjectionErasureAuthority implements ErasureAuthority {
  constructor(private readonly kv: KVNamespace, private readonly keyPrefix: string) {}
  async eraseExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "search_projection") return this.fail("PA_POLICY_DENIED", "search projection authority accepts search_projection targets only");
    const key = this.key(target); if (!key.ok) return key;
    try { await this.kv.delete(key.value); return success(true); } catch { return this.fail("PA_UNAVAILABLE", "search projection erasure unavailable"); }
  }
  async restrictExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "search_projection") return this.fail("PA_POLICY_DENIED", "search projection authority accepts search_projection targets only");
    const key = this.key(target); if (!key.ok) return key;
    try { const value = await this.kv.get(key.value); return value !== null ? success(true) : this.fail("PA_NOT_FOUND", "restricted search projection missing"); }
    catch { return this.fail("PA_UNAVAILABLE", "search projection restriction verification unavailable"); }
  }
  async verifyAbsent(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "search_projection") return this.fail("PA_POLICY_DENIED", "search projection authority accepts search_projection targets only");
    const key = this.key(target); if (!key.ok) return key;
    try { const value = await this.kv.get(key.value); return value !== null ? this.fail("PA_INTEGRITY_MISMATCH", "search projection remains") : success(true); }
    catch { return this.fail("PA_UNAVAILABLE", "search projection absence verification unavailable"); }
  }
  private key(target: ErasureTarget): KnowledgeResult<string> {
    const indexKey = target.locator.indexKey; if (!indexKey) return this.fail("PA_POLICY_DENIED", "search projection locator missing indexKey");
    return { ok: true, value: `${this.keyPrefix}:${target.targetType}:${target.targetId}:${indexKey}` };
  }
  private fail<Code extends "PA_POLICY_DENIED" | "PA_NOT_FOUND" | "PA_INTEGRITY_MISMATCH" | "PA_UNAVAILABLE">(code: Code, detail: string) { return { ok: false as const, code, detail }; }
}

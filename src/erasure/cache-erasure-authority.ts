/*
<MODULE_CONTRACT>
<purpose>Erase or verify one exact cache target stored in a Cloudflare Cache API or KV namespace.</purpose>
<non-goals><item>Do not plan erasure, accept non-cache authorities, or log cached content.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1009: add cache erasure authority.</item></CHANGE_SUMMARY>
*/

import { success } from "@warpgogol/projektarchiv-core";
import type {
  ErasureAuthority,
  ErasureTarget,
} from "@warpgogol/projektarchiv-operations/retention";
import type { KnowledgeResult } from "@warpgogol/projektarchiv-operations/knowledge";

export class CacheErasureAuthority implements ErasureAuthority {
  constructor(
    private readonly kv: KVNamespace,
    private readonly keyPrefix: string,
  ) {}
  async eraseExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "cache")
      return this.fail("PA_POLICY_DENIED", "cache authority accepts cache targets only");
    const key = this.key(target);
    if (!key.ok) return key;
    try {
      await this.kv.delete(key.value);
      return success(true);
    } catch {
      return this.fail("PA_UNAVAILABLE", "cache erasure unavailable");
    }
  }
  async restrictExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "cache")
      return this.fail("PA_POLICY_DENIED", "cache authority accepts cache targets only");
    const key = this.key(target);
    if (!key.ok) return key;
    try {
      const value = await this.kv.get(key.value);
      return value !== null
        ? success(true)
        : this.fail("PA_NOT_FOUND", "restricted cache entry missing");
    } catch {
      return this.fail("PA_UNAVAILABLE", "cache restriction verification unavailable");
    }
  }
  async verifyAbsent(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "cache")
      return this.fail("PA_POLICY_DENIED", "cache authority accepts cache targets only");
    const key = this.key(target);
    if (!key.ok) return key;
    try {
      const value = await this.kv.get(key.value);
      return value !== null
        ? this.fail("PA_INTEGRITY_MISMATCH", "cache entry remains")
        : success(true);
    } catch {
      return this.fail("PA_UNAVAILABLE", "cache absence verification unavailable");
    }
  }
  private key(target: ErasureTarget): KnowledgeResult<string> {
    const cacheKey = target.locator.cacheKey;
    if (!cacheKey) return this.fail("PA_POLICY_DENIED", "cache locator missing cacheKey");
    return {
      ok: true,
      value: `${this.keyPrefix}:${target.targetType}:${target.targetId}:${cacheKey}`,
    };
  }
  private fail<
    Code extends "PA_POLICY_DENIED" | "PA_NOT_FOUND" | "PA_INTEGRITY_MISMATCH" | "PA_UNAVAILABLE",
  >(code: Code, detail: string) {
    return { ok: false as const, code, detail };
  }
}

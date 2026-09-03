/*
<MODULE_CONTRACT>
<purpose>Erase or verify one exact project-scoped R2 artifact target under a pre-authorized erasure plan.</purpose>
<non-goals><item>Do not plan erasure, accept non-artifact authorities, or log object locators.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1009: add the narrowly destructive R2 erasure authority.</item></CHANGE_SUMMARY>
*/

import { success, type TenantScope } from "@warpgogol/projektarchiv-core";
import type { ErasureAuthority, ErasureTarget } from "@warpgogol/projektarchiv-operations/retention";
import type { KnowledgeResult } from "@warpgogol/projektarchiv-operations/knowledge";
import { artifactObjectKey } from "../artifact-store/artifact-object-key.ts";
import { decodeArtifactMetadata } from "../artifact-store/artifact-integrity.ts";

export class R2ErasureStore implements ErasureAuthority {
  constructor(private readonly bucket: R2Bucket, private readonly authoritativeScope: TenantScope) {}
  async eraseExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    const key = this.key(target); if (!key.ok) return key;
    try { const object = await this.bucket.head(key.value); if (!object) return this.fail("PA_NOT_FOUND", "artifact target absent without receipt");
      if (target.expectedSha256) { const metadata = decodeArtifactMetadata(object.customMetadata);
        if (!metadata || metadata.contentSha256 !== target.expectedSha256) return this.fail("PA_INTEGRITY_MISMATCH", "artifact target hash changed"); }
      await this.bucket.delete(key.value); return success(true); } catch { return this.fail("PA_UNAVAILABLE", "artifact erasure unavailable"); }
  }
  async restrictExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    const key = this.key(target); if (!key.ok) return key;
    try { return await this.bucket.head(key.value) ? success(true) : this.fail("PA_NOT_FOUND", "restricted artifact missing"); }
    catch { return this.fail("PA_UNAVAILABLE", "artifact restriction verification unavailable"); }
  }
  async verifyAbsent(target: ErasureTarget): Promise<KnowledgeResult<true>> { const key = this.key(target); if (!key.ok) return key;
    try { return await this.bucket.head(key.value) ? this.fail("PA_INTEGRITY_MISMATCH", "artifact payload remains") : success(true); }
    catch { return this.fail("PA_UNAVAILABLE", "artifact absence verification unavailable"); } }
  private key(target: ErasureTarget): KnowledgeResult<string> { if (target.authority !== "artifact") return this.fail("PA_POLICY_DENIED", "R2 authority accepts artifact targets only");
    const objectKey = target.locator.objectKey; if (!objectKey) return this.fail("PA_POLICY_DENIED", "artifact locator missing");
    const key = artifactObjectKey(this.authoritativeScope, objectKey); return key.ok ? success(key.value) : this.fail("PA_SCOPE_MISMATCH", key.detail); }
  private fail<Code extends "PA_NOT_FOUND" | "PA_INTEGRITY_MISMATCH" | "PA_UNAVAILABLE" | "PA_POLICY_DENIED" | "PA_SCOPE_MISMATCH">(code: Code, detail: string) { return { ok: false as const, code, detail }; }
}

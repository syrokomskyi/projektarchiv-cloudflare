/*
<MODULE_CONTRACT>
<purpose>Erase or verify one exact provider copy target via a configured provider-side deletion endpoint.</purpose>
<non-goals><item>Do not plan erasure, accept non-provider authorities, embed credentials, or log provider responses.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1009: add provider copy erasure authority.</item></CHANGE_SUMMARY>
*/

import { success } from "@warpgogol/projektarchiv-core";
import type {
  ErasureAuthority,
  ErasureTarget,
} from "@warpgogol/projektarchiv-operations/retention";
import type { KnowledgeResult } from "@warpgogol/projektarchiv-operations/knowledge";

export class ProviderCopyErasureAuthority implements ErasureAuthority {
  constructor(
    private readonly deletionEndpoint: string,
    private readonly authorizationToken: string,
  ) {}
  async eraseExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "provider_copy")
      return this.fail(
        "PA_POLICY_DENIED",
        "provider copy authority accepts provider_copy targets only",
      );
    const providerId = target.locator.providerId;
    if (!providerId)
      return this.fail("PA_POLICY_DENIED", "provider copy locator missing providerId");
    try {
      const response = await fetch(this.deletionEndpoint, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.authorizationToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: target.targetType,
          targetId: target.targetId,
          providerId,
        }),
      });
      return response.ok
        ? success(true)
        : this.fail("PA_UNAVAILABLE", "provider copy deletion failed");
    } catch {
      return this.fail("PA_UNAVAILABLE", "provider copy erasure unavailable");
    }
  }
  async restrictExact(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "provider_copy")
      return this.fail(
        "PA_POLICY_DENIED",
        "provider copy authority accepts provider_copy targets only",
      );
    const providerId = target.locator.providerId;
    if (!providerId)
      return this.fail("PA_POLICY_DENIED", "provider copy locator missing providerId");
    try {
      const response = await fetch(
        `${this.deletionEndpoint}?targetType=${target.targetType}&targetId=${target.targetId}&providerId=${providerId}`,
        { headers: { Authorization: `Bearer ${this.authorizationToken}` } },
      );
      return response.ok
        ? success(true)
        : this.fail("PA_NOT_FOUND", "restricted provider copy missing");
    } catch {
      return this.fail("PA_UNAVAILABLE", "provider copy restriction verification unavailable");
    }
  }
  async verifyAbsent(target: ErasureTarget): Promise<KnowledgeResult<true>> {
    if (target.authority !== "provider_copy")
      return this.fail(
        "PA_POLICY_DENIED",
        "provider copy authority accepts provider_copy targets only",
      );
    const providerId = target.locator.providerId;
    if (!providerId)
      return this.fail("PA_POLICY_DENIED", "provider copy locator missing providerId");
    try {
      const response = await fetch(
        `${this.deletionEndpoint}?targetType=${target.targetType}&targetId=${target.targetId}&providerId=${providerId}`,
        { headers: { Authorization: `Bearer ${this.authorizationToken}` } },
      );
      if (!response.ok) return success(true);
      const body = (await response.json()) as { exists?: boolean };
      return body.exists
        ? this.fail("PA_INTEGRITY_MISMATCH", "provider copy remains")
        : success(true);
    } catch {
      return this.fail("PA_UNAVAILABLE", "provider copy absence verification unavailable");
    }
  }
  private fail<
    Code extends "PA_POLICY_DENIED" | "PA_NOT_FOUND" | "PA_INTEGRITY_MISMATCH" | "PA_UNAVAILABLE",
  >(code: Code, detail: string) {
    return { ok: false as const, code, detail };
  }
}

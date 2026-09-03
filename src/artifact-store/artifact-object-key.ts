/*
<MODULE_CONTRACT>
<purpose>Validate canonical relative artifact keys and derive complete tenant-scoped R2 object identities.</purpose>
<non-goals>
  <item>Do not allocate revisions, accept full provider keys, or perform storage I/O.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-1004: add canonical artifact and quarantine object-key derivation.</item>
</CHANGE_SUMMARY>
*/

import {
  artifactIdSchema,
  failure,
  success,
  type DomainResult,
  type TenantScope,
} from "@warpgogol/projektarchiv-core";

const safeDerivedName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;

function validateArtifactRelativeKey(relativeKey: string): boolean {
  if (
    relativeKey.startsWith("/") ||
    relativeKey.includes("\\") ||
    relativeKey.includes("//") ||
    relativeKey.includes("?") ||
    relativeKey.includes("#") ||
    relativeKey.toLowerCase().includes("%2f") ||
    relativeKey.toLowerCase().includes("%5c")
  ) {
    return false;
  }
  const segments = relativeKey.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false;
  }
  if (segments[0] !== "artifacts" || segments.length < 4) return false;
  if (!artifactIdSchema.safeParse(segments[1]).success) return false;
  if (!/^[1-9]\d*$/u.test(segments[2])) return false;
  if (segments[3] === "original") return segments.length === 4;
  return (
    segments[3] === "derived" &&
    segments.length === 5 &&
    safeDerivedName.test(segments[4] ?? "")
  );
}

function scopePrefix(scope: TenantScope): string {
  return `${scope.tenantId}/${scope.clientId}/${scope.projectId}`;
}

export function artifactObjectKey(
  scope: TenantScope,
  relativeKey: string,
): DomainResult<string, "PA_UNAVAILABLE"> {
  return validateArtifactRelativeKey(relativeKey)
    ? success(`${scopePrefix(scope)}/${relativeKey}`)
    : failure("PA_UNAVAILABLE", "artifact object key is not canonical");
}

export function quarantineObjectKey(
  scope: TenantScope,
  relativeKey: string,
): DomainResult<string, "PA_UNAVAILABLE"> {
  return validateArtifactRelativeKey(relativeKey)
    ? success(`${scopePrefix(scope)}/quarantine/${relativeKey}`)
    : failure("PA_UNAVAILABLE", "artifact object key is not canonical");
}

export function quarantineRelativeKey(relativeKey: string): string {
  return `quarantine/${relativeKey}`;
}

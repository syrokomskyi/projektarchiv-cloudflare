/*
<MODULE_CONTRACT>
<purpose>Read tenant-scoped retained artifact bytes from R2 for portable export assembly.</purpose>
<non-goals><item>Do not write, delete, or modify R2 objects. Do not plan exports or filter retention dispositions.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1010: add the read-only R2 export artifact reader adapter.</item></CHANGE_SUMMARY>
*/

import { failure, success, type TenantScope } from "@warpgogol/projektarchiv-core";
import type { ExportArtifactReader } from "@warpgogol/projektarchiv-operations/export";
import type { KnowledgeResult } from "@warpgogol/projektarchiv-operations/knowledge";
import { artifactObjectKey } from "../artifact-store/artifact-object-key.ts";

export class R2ExportReader implements ExportArtifactReader {
  constructor(private readonly bucket: R2Bucket) {}

  async read(
    scope: TenantScope,
    artifactId: string,
    revision: number,
  ): Promise<KnowledgeResult<Uint8Array>> {
    const relativeKey = `artifacts/${artifactId}/${revision}/original`;
    const keyResult = artifactObjectKey(scope, relativeKey);
    if (!keyResult.ok) return failure(keyResult.code, keyResult.detail);
    try {
      const object = await this.bucket.get(keyResult.value);
      if (!object) return failure("PA_NOT_FOUND", "artifact not found in R2");
      const bytes = new Uint8Array(await object.arrayBuffer());
      return success(bytes);
    } catch {
      return failure("PA_UNAVAILABLE", "artifact read failed");
    }
  }
}

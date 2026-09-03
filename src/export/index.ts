/*
<MODULE_CONTRACT>
<purpose>Expose Cloudflare-specific export adapters for reading retained artifacts from R2.</purpose>
<non-goals><item>Do not own domain schemas, workflows, or export orchestration logic.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1010: publish the R2 export reader adapter surface.</item></CHANGE_SUMMARY>
*/

export * from "./r2-export-reader.ts";

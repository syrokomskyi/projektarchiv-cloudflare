/*
<MODULE_CONTRACT><purpose>Expose exact Cloudflare erasure authorities and durable project-local execution plan storage adapters.</purpose>
<non-goals><item>Do not expose policy evaluation or destructive orchestration.</item></non-goals></MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1009: publish Cloudflare erasure adapter surface.</item></CHANGE_SUMMARY>
*/
export * from "./r2-erasure-store.ts";
export * from "./sqlite-erasure-plan-store.ts";
export * from "./catalog-payload-erasure-authority.ts";
export * from "./search-projection-erasure-authority.ts";
export * from "./cache-erasure-authority.ts";
export * from "./provider-copy-erasure-authority.ts";

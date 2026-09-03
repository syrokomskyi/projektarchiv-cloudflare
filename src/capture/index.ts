/*
<MODULE_CONTRACT>
<purpose>Expose the production Cloudflare capture lifecycle journal adapter for runtime composition.</purpose>
<non-goals><item>Do not expose Durable Object bindings or source-provider credentials.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1007: publish the SQLite capture run store.</item></CHANGE_SUMMARY>
*/
export * from "./sqlite-capture-run-store.ts";

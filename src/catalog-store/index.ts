/*
<MODULE_CONTRACT>
<purpose>Expose the Cloudflare Projektarchiv catalog adapter and its narrow provider seam.</purpose>
<non-goals><item>Do not export catalog provider types through the portable core.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1003: add the Iceberg CatalogStore public adapter surface.</item></CHANGE_SUMMARY>
*/

export * from "./catalog-store-identity.ts";
export * from "./iceberg-catalog-store.ts";
export * from "./iceberg-history-client.ts";
export * from "./icebird-history-client.ts";
export * from "./logical-tables.ts";

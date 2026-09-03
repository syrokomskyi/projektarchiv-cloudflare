/*
<MODULE_CONTRACT>
<purpose>Expose the Cloudflare project-local durable knowledge coordination and exact intent storage adapter.</purpose>
<non-goals><item>Do not expose application workflows, provider processors, or public runtime routes.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-1008: publish the SQLite knowledge adapter surface.</item></CHANGE_SUMMARY>
*/

export { SqliteKnowledgeStore } from "./sqlite-knowledge-store.ts";

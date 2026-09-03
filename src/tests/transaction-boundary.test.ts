// @vitest-environment node

import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import type { SyncSqlStorage } from "../coordinator/sql.ts";

it("exposes no asynchronous operation inside the transaction callback", () => {
  const source = readFileSync(
    new URL("../coordinator/sqlite-project-revision-coordinator.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(/transactionSync\s*\(\s*async\b/);
  expect(source).not.toMatch(
    /from\s+["'](?:cloudflare:workers|node:|@google|@aws-sdk|wrangler)/,
  );
  expect(source).not.toMatch(/\b(?:fetch|setTimeout|queueMicrotask)\s*\(/);

  type TransactionCallback = Parameters<SyncSqlStorage["transactionSync"]>[0];
  const synchronous: TransactionCallback = () => ({ ok: true as const });
  expect(synchronous()).toEqual({ ok: true });
});

// eslint-disable-next-line no-restricted-imports -- Cloudflare Vitest exposes real Durable Object bindings from this workerd-only module.
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { projectCatalogStoreName } from "@warpgogol/projektarchiv-cloudflare/catalog-store";
import { foreignScope, scope } from "../testing/fixtures.ts";

it("the named catalog writer rejects foreign full scope before provider access", async () => {
  const stub = env.PROJECT_CATALOG_STORE.getByName(projectCatalogStoreName(scope));
  await expect(stub.getCurrentCommit(foreignScope)).resolves.toMatchObject({
    ok: false,
    code: "PA_SCOPE_MISMATCH",
  });
});

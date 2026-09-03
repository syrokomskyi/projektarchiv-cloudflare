# @warpgogol/projektarchiv-cloudflare

Cloudflare-specific adapters that depend inward on `@warpgogol/projektarchiv-core`. The package owns no domain schema and exposes no provider capability back into core.

RFC-1002 provides the SQLite `ProjectRevisionCoordinator`. Coordinator transactions are synchronous local SQL only; Drive, R2, Data Catalog, HTTP, AI, and arbitrary callbacks are forbidden inside coordination authority.

RFC-1010 adds the R2 export reader adapter for reading retained artifacts during portable export assembly.

## Subpath exports

- `@warpgogol/projektarchiv-cloudflare` — full barrel
- `@warpgogol/projektarchiv-cloudflare/export` — R2 export reader adapter
- `@warpgogol/projektarchiv-cloudflare/erasure` — R2 erasure adapter

Run `pnpm --filter @warpgogol/projektarchiv-cloudflare check` for the scoped contract suite.

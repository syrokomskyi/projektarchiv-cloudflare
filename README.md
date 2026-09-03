# @warpgogol/projektarchiv-cloudflare

Cloudflare-specific adapters that depend inward on `@warpgogol/projektarchiv-core`. The package owns no domain schema and exposes no provider capability back into core.

RFC-1002 provides the SQLite `ProjectRevisionCoordinator`. Coordinator transactions are synchronous local SQL only; Drive, R2, Data Catalog, HTTP, AI, and arbitrary callbacks are forbidden inside coordination authority.

Run `pnpm --filter @warpgogol/projektarchiv-cloudflare check` for the scoped contract suite.

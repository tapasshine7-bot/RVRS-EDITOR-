# Cloudflare deployment note

This archive is a **complete source archive**, not a direct Cloudflare Pages upload. It contains the REVRSE EDITOR frontend, the Express/tRPC backend, Drizzle schema and migrations, and the lockfile required to reproduce the build. It deliberately excludes `.env` files, `node_modules`, build output, logs, and Git metadata.

## Why a direct Cloudflare Pages upload will not work

The project starts a Node/Express server with `pnpm start` and uses MySQL-compatible database access, OAuth, S3-compatible storage, and server-side tRPC endpoints. Cloudflare Pages is a static hosting service, so it cannot run the current Express server or `/api/trpc` backend as-is. The repository does not include `wrangler.toml`, a Pages Functions directory, or a Worker entry point.

## Supported deployment choices

| Choice | Status | What is needed |
|---|---|---|
| Manus built-in hosting | Compatible with the current project | Publish the saved project version from the Manus interface. |
| Node-compatible host | Compatible after environment configuration | Install dependencies with `pnpm install --frozen-lockfile`, build with `pnpm build`, run with `pnpm start`, and configure the database, OAuth, storage, and JWT environment variables. |
| Cloudflare Workers or Pages | Requires a future migration | Replace/adapt the Express runtime and server routes for Workers, configure a compatible database strategy, move secrets into Cloudflare, and update OAuth callback URLs. Do not upload this ZIP to Pages and expect the authenticated API or database features to work. |

## Before any production deployment

1. Install dependencies with the locked package manager version.
2. Configure production database, OAuth, JWT, storage, and application environment variables securely; never commit or upload `.env` files.
3. Apply the reviewed Drizzle migrations to the production database.
4. Set the production OAuth callback URL for the selected host.
5. Run `pnpm check` and `pnpm test`, then validate sign-in, local-first editing, export preparation, creator reporting, and audio/voice-over permissions in the production-like environment.

> A Cloudflare migration should be treated as a separate engineering task. It must preserve the local-first editor, authorized API routes, database security, and server-only credentials rather than attempting a static-only upload.

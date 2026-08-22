# Deploy REVRSE EDITOR on Cloudflare Workers

## What this version is

This repository now contains a **separate Cloudflare Workers version** under `cloudflare/`. It preserves the existing REVRSE EDITOR interface and browser-local editing behavior, but uses Workers Static Assets, D1 metadata, Cloudflare Access identity, and R2 for any approved shared-media files. The original Node/Express, MySQL/TiDB, Manus OAuth, and Manus storage release is still present and unchanged.

> Do **not** upload the old source ZIP directly to Cloudflare Pages. The `rvrdeditor.pages.dev` project previously had no completed application build, which is why it returned a 404. Use the Workers path below after completing the required Cloudflare setup.

## One-time Cloudflare setup

| Step | What to create or configure | Why it is needed |
|---|---|---|
| 1 | Enable **R2** for the Cloudflare account. | Shared creator video/audio must use object storage; bytes are never stored in D1. |
| 2 | Create a new D1 database named `revrse-editor`. | It holds account project structure, template metadata, favourites, authentic reviews, and private reports. |
| 3 | Create a new R2 bucket named `revrse-editor-media`. | It holds only rights-attested shared video or sound files. Local imports and voice-over stay in the browser by default. |
| 4 | Create a Cloudflare Access application for the new Worker domain. | It gives the Worker a verified identity instead of trusting a browser-supplied email or role. Protect the entire Worker site for the simplest secure setup. |
| 5 | Record the Access team domain, application audience tag, and the owner’s approved sign-in email. | The Worker verifies signed Access JWTs and grants moderation only when the verified email matches `ADMIN_EMAIL`. |

Do not reuse an unrelated D1 database, R2 bucket, Access application, or Worker. Do not put tokens, Access values, database IDs, or personal credentials in frontend code, GitHub, or a ZIP archive.

## Deploy in six short steps

1. Open a terminal in the project folder and run `pnpm install --frozen-lockfile`.
2. Copy `cloudflare/wrangler.production.jsonc.example` to `cloudflare/wrangler.production.jsonc`.
3. In the copied file, replace `REPLACE_WITH_D1_DATABASE_ID` with the new D1 database ID. Keep the binding names exactly as shown: `REVRSE_DB` and `REVRSE_MEDIA`.
4. Add `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `ADMIN_EMAIL` as **Worker secrets or protected variables** in the Cloudflare dashboard. These must not be Vite variables or frontend configuration.
5. Apply the reviewed schema once: `pnpm exec wrangler d1 migrations apply revrse-editor --remote --config cloudflare/wrangler.production.jsonc`.
6. Build and deploy: `pnpm cf:build && pnpm exec wrangler deploy --config cloudflare/wrangler.production.jsonc`.

After deployment, use the Worker URL shown by Cloudflare. If you later want a custom domain, attach it in the Worker settings. Do not assume `rvrdeditor.pages.dev` will change until you deliberately replace that Pages deployment or move the desired domain to this Worker.

## Local checks

Run these before any deployment:

```bash
pnpm check
pnpm cf:check
pnpm test
pnpm cf:build
pnpm cf:dev
```

The local Worker intentionally starts without account bindings. In that state, the editor shell and browser-local workflow load, while account sync and community endpoints return a clear **503 configuration** response rather than accepting insecure data. Once Cloudflare Access, D1, and R2 are configured, validate sign-in, browser-local project recovery, project sync, rights-attested publication, private reports, owner-only moderation, and the absence of any third-party music catalogue or standalone downloads.

## Important protections retained

| Area | Worker behavior |
|---|---|
| Local media and voice-over | Remain browser-local and are never automatically uploaded. |
| Cloud project sync | Stores project structure only; restoring a project still requires the user to re-import local media. |
| Shared creator media | Requires explicit rights attestation, supported file validation, and R2. It cannot fall back to D1 or base64 persistence. |
| Reviews and reports | Require a verified Cloudflare Access identity. Creators cannot review or report their own shared resources. Reports remain private. |
| Moderation | Requires the verified Access email to equal the server-only `ADMIN_EMAIL` value. A frontend role cannot grant access. |
| Music catalogue | Still intentionally disabled. No commercial music copying, Instagram/Reels audio import, or standalone download is enabled. |

For the complete design and data boundary, read [`CLOUDFLARE_MIGRATION_ARCHITECTURE.md`](./CLOUDFLARE_MIGRATION_ARCHITECTURE.md).

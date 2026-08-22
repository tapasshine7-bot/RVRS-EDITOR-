# REVRSE EDITOR — Cloudflare Workers Migration Architecture

## Purpose and deployment boundary

This folder is an **isolated Cloudflare Workers version** of REVRSE EDITOR. It supplements the existing Node/Express, MySQL/TiDB, Manus OAuth, and Manus storage application; it does not overwrite, disable, or claim compatibility with that runtime. The current `rvrdeditor.pages.dev` project has a production deployment record but no completed clone or build stage, so it does not contain a deployable REVRSE EDITOR build.

Cloudflare recommends Workers Static Assets for new static, SPA, and full-stack deployments. The Worker configuration therefore serves the Vite build and routes `/api/*` to Worker code, while SPA client routes fall back to the application shell. [1] [2]

## Proposed isolated resource model

| Concern | Cloudflare resource | Security rule | Current account state |
|---|---|---|---|
| Frontend and API | New Workers Static Assets application named `revrse-editor-cloudflare` | The Worker, rather than a public browser client, owns all bindings and sensitive configuration. | Not created. |
| Account/project/community metadata | Dedicated D1 database bound as `REVRSE_DB` | Store only structured metadata and project JSON; never store uploaded binary media bytes. | No dedicated database currently exists. |
| Rights-attested shared media | Dedicated R2 bucket bound as `REVRSE_MEDIA` | Accept only rights-attested creator uploads; store object keys and metadata in D1, never media bytes in D1. Browser-local imports and voice-over never auto-upload. | R2 is not enabled for this account. |
| Authentication | Cloudflare Access plus Worker JWT validation | Protected endpoints require a valid `Cf-Access-Jwt-Assertion`; the Worker verifies issuer and audience against the Access JWKS. The admin role is determined server-side by a configured owner email, never by frontend state. | Access application has not been configured for this Worker. |
| Public browsing | Read-only Worker routes | Public visitors may view empty or rights-attested community records, but cannot save projects, publish, review, favourite, report, or moderate without a verified identity. | Enforced by Worker code. |

> Cloudflare’s Access guidance states that Workers should validate the JWT carried in `Cf-Access-Jwt-Assertion`, using the team-domain JWKS, issuer, and application audience. This migration intentionally does not trust a client-supplied email or role. [3]

## Data and copyright safeguards

The migration retains browser-local editing as the default. Project media files and microphone recordings remain browser object URLs and local browser state. Optional account sync stores editable **project structure only**, so a user restoring a project must re-import any local media. The D1 schema contains metadata, project JSON, reviews, and reports; it contains no binary/BLOB media columns.

Only a signed-in creator who positively attests to having the required rights may publish a shared template or shared media. Shared binary publishing is deliberately unavailable until a dedicated R2 bucket is enabled and bound. The Worker must reject media publication when R2 is unavailable instead of accepting a base64 payload, silently storing data in D1, or exposing an unsafe fallback. No commercial catalogue, music extraction, remote-audio import, standalone download, autoplay, or fabricated community content is introduced.

## Required deployment configuration

The source is intentionally safe to build before Cloudflare resources exist. A production deployment requires the following items to be configured in the Cloudflare dashboard or by a user-authorized resource-creation step:

| Binding or variable | Required for | Where it belongs | Value source |
|---|---|---|---|
| `REVRSE_DB` | Account sync, community resources, reviews, reports | D1 binding in Wrangler/dashboard | Newly created dedicated D1 database. |
| `REVRSE_MEDIA` | Publishing rights-attested shared video/sound files | R2 binding in Wrangler/dashboard | Newly created dedicated R2 bucket after R2 is enabled. |
| `ACCESS_TEAM_DOMAIN` | Verified Access JWT checks | Worker secret/variable | `https://<team>.cloudflareaccess.com`. |
| `ACCESS_AUD` | Verified Access JWT checks | Worker secret/variable | The Access application’s audience tag. |
| `ADMIN_EMAIL` | Owner-only moderation | Worker secret/variable | The owner’s approved Cloudflare Access email. |

The configuration must not put any secret, audience tag, Access token, R2 key, or personal account credential in the frontend, Git repository, ZIP archive, or Vite environment. The Worker returns a clear service-configuration error for protected functions until required bindings are present.

## Implementation approach

The Cloudflare Vite entry uses the existing editor UI and pure local editor model. A narrow client adapter preserves the current editor contracts by calling same-origin Worker endpoints instead of importing the existing tRPC/Manus runtime. The Worker exposes only the endpoints used by the editor, with server-side authorization and validation. This keeps the existing local-first UI while avoiding an insecure fake client-only account layer.

The Worker version will be tested as source and built locally. It will not be deployed, attached to a domain, connected to a Pages project, or allowed to create D1/R2 resources without a final user-approved Cloudflare operation. The source package will include short, sequential setup steps for an inexperienced deployer.

## References

[1]: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/ "Cloudflare Workers — React"
[2]: https://developers.cloudflare.com/workers/static-assets/ "Cloudflare Workers — Static Assets"
[3]: https://developers.cloudflare.com/changelog/product/workers/6/ "Cloudflare Workers — Access JWT validation guidance"

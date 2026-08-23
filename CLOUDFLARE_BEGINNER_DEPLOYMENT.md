# REVRSE EDITOR: Simple Cloudflare Deployment Guide

This guide deploys the verified **REVRSE EDITOR Cloudflare package**. It does **not** change the editor design or features. The project deploys as a **Cloudflare Worker with Static Assets**, not as a Cloudflare Pages upload.

> **Keep passwords, Cloudflare tokens, database IDs, Access values, and secret values private. Do not paste them into GitHub, the ZIP, or chat.** Cloudflare bindings and secrets are designed to keep these values out of application code.[1] [2]

## Before you start

| You need | Why |
|---|---|
| A laptop or desktop computer | The deployment uses a terminal to build and deploy the Worker. |
| The supplied `REVRSE-EDITOR-CLOUDFLARE-bcda41e.zip` file | This is the verified source package. |
| A Cloudflare account | It will own the Worker, D1 database, R2 bucket, and Access protection. |
| Node.js LTS and internet access | Node runs the build and Cloudflare command-line tool. |
| An email address you control | Cloudflare Access uses it to identify the editor owner. |

## Step 1 — Extract the ZIP

1. Download `REVRSE-EDITOR-CLOUDFLARE-bcda41e.zip`.
2. Right-click the ZIP and select **Extract All**.
3. Open the extracted folder. You should see folders such as `cloudflare`, `client`, and `server`, plus `package.json`.
4. Do **not** rename the `cloudflare` folder or move files out of it.

## Step 2 — Open a terminal in the folder

On Windows, open the extracted folder in File Explorer, click its address bar, type `powershell`, and press Enter. On macOS or Linux, open Terminal and use `cd` to enter the extracted folder.

Run the following commands one by one:

```bash
corepack enable
pnpm install --frozen-lockfile
```

If `pnpm` is not found after running `corepack enable`, install Node.js LTS from [nodejs.org](https://nodejs.org/) and reopen the terminal. The project uses the pinned `pnpm` version declared in `package.json`.

## Step 3 — Sign in to Cloudflare from the terminal

Run:

```bash
pnpm exec wrangler login
```

A browser window will open. Sign in to the Cloudflare account that should own the editor, then approve the request. Return to the terminal only after it says the login succeeded. Wrangler is Cloudflare’s supported command-line tool for creating and deploying Workers.[1]

## Step 4 — Create the D1 database

1. Open the Cloudflare dashboard.
2. Go to **Workers & Pages** → **D1 SQL Database**.
3. Select **Create Database**.
4. Enter this exact name: `revrse-editor`.
5. Select **Create**.
6. Open the newly created database and copy its **Database ID** somewhere private for the next step.

Cloudflare documents that a Worker needs a D1 binding to connect to its database; the binding name in this package is fixed as `REVRSE_DB`.[3]

## Step 5 — Create the R2 media bucket

In the same terminal, run:

```bash
pnpm exec wrangler r2 bucket create revrse-editor-media
```

This creates the private bucket used only for approved shared media. Do **not** make this bucket public. Personal imports and voice-over remain browser-local by default. R2 buckets are private by default.[4]

## Step 6 — Create the production Worker configuration file

Run **one** of the following commands.

| Your computer | Command |
|---|---|
| Windows PowerShell | `Copy-Item cloudflare\wrangler.production.jsonc.example cloudflare\wrangler.production.jsonc` |
| macOS or Linux | `cp cloudflare/wrangler.production.jsonc.example cloudflare/wrangler.production.jsonc` |

Then open this new file in a text editor:

```text
cloudflare/wrangler.production.jsonc
```

Find this line:

```json
"database_id": "REPLACE_WITH_D1_DATABASE_ID"
```

Replace **only** `REPLACE_WITH_D1_DATABASE_ID` with the private D1 Database ID copied in Step 4. Keep all of these names unchanged:

| Configuration item | Must stay exactly this |
|---|---|
| Worker name | `revrse-editor-cloudflare` |
| D1 binding | `REVRSE_DB` |
| D1 database name | `revrse-editor` |
| R2 binding | `REVRSE_MEDIA` |
| R2 bucket name | `revrse-editor-media` |

Save the file. Do **not** commit this finished file to a public GitHub repository because it contains your private database ID.

## Step 7 — Create the D1 tables

Run this exactly:

```bash
pnpm exec wrangler d1 migrations apply revrse-editor --remote --config cloudflare/wrangler.production.jsonc
```

Type `y` only if the terminal shows the database name `revrse-editor` and you are ready to create the application tables. This step sets up the editor’s project metadata, template metadata, favourites, reviews, and private reports. It does not upload video or audio files.

## Step 8 — Build and deploy the Worker

First build the unchanged editor:

```bash
pnpm cf:build
```

Then deploy it:

```bash
pnpm exec wrangler deploy --config cloudflare/wrangler.production.jsonc
```

Wait for the command to finish. It prints the temporary Worker address. Open that address in your browser and confirm that the editor home screen loads.

> Cloudflare configuration files are the source of truth for a Worker’s entry point, assets, routes, and bindings.[2]

## Step 9 — Protect the deployed editor with Cloudflare Access

This is required before using accounts, creator publishing, moderation, reviews, or reports.

1. In the Cloudflare dashboard, open **Zero Trust**.
2. Go to **Access** → **Applications** → **Add an application**.
3. Select the Worker application option if it is offered. If Cloudflare asks for a hostname instead, first add a custom domain in **Workers & Pages** → `revrse-editor-cloudflare` → **Settings** → **Domains & Routes**, then protect that hostname.
4. Create an **Allow** policy for only your own email address first.
5. Save the application.
6. Copy the application’s **Audience (AUD)** value and your Cloudflare Access team domain. Keep both private.

Cloudflare Access applications deny users by default until an Allow policy matches, so check the allowed email carefully.[5]

## Step 10 — Add the three protected Worker values

Run these commands **one at a time**. Each command privately asks for a value; type it into the terminal, press Enter, and do not paste the value into files or chat.

```bash
pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN --config cloudflare/wrangler.production.jsonc
pnpm exec wrangler secret put ACCESS_AUD --config cloudflare/wrangler.production.jsonc
pnpm exec wrangler secret put ADMIN_EMAIL --config cloudflare/wrangler.production.jsonc
```

Use the following values when each prompt appears:

| Secret name | Value to enter |
|---|---|
| `ACCESS_TEAM_DOMAIN` | Your Access team domain, for example `your-team.cloudflareaccess.com` — no password. |
| `ACCESS_AUD` | The Access application’s Audience value copied in Step 9. |
| `ADMIN_EMAIL` | The one owner email address allowed to moderate content. |

Cloudflare stores Worker secrets as encrypted bindings; after saving, their values are hidden in the dashboard and Wrangler.[6]

## Step 11 — Deploy once more and test

Run the deploy command once more after adding the three secrets:

```bash
pnpm exec wrangler deploy --config cloudflare/wrangler.production.jsonc
```

Now open the Worker URL or your custom domain. Test these actions in order:

1. Confirm the editor opens.
2. Confirm Cloudflare Access asks for your allowed email.
3. Create a browser-local project.
4. Confirm local media stays local unless you deliberately publish rights-attested shared media.
5. Check that normal users cannot access owner moderation actions.

## If a command fails

| What you see | What to do |
|---|---|
| `pnpm: command not found` | Install Node.js LTS, reopen the terminal, then run `corepack enable`. |
| `Not logged in` | Run `pnpm exec wrangler login` again. |
| Database binding or ID error | Recheck Step 6. The database name must be `revrse-editor`, and the binding must remain `REVRSE_DB`. |
| R2 bucket error | Rerun the Step 5 command and confirm the bucket is named `revrse-editor-media`. |
| Access sign-in loop or 403 | Recheck the Access Allow policy, `ACCESS_TEAM_DOMAIN`, and `ACCESS_AUD`. |
| The Worker deploys but account features return 503 | This means D1, R2, or Access is not fully configured yet. Recheck Steps 4–10. |

## Safe rule to remember

**Never put a password, token, D1 ID, Access AUD value, or secret into GitHub, a screenshot, or a chat message.** Use the Worker secret prompts in Step 10 instead.

## References

[1]: https://developers.cloudflare.com/workers/wrangler/commands/ "Cloudflare Wrangler commands"
[2]: https://developers.cloudflare.com/workers/wrangler/configuration/ "Cloudflare Wrangler configuration"
[3]: https://developers.cloudflare.com/d1/get-started/ "Cloudflare D1 getting started"
[4]: https://developers.cloudflare.com/r2/buckets/create-buckets/ "Cloudflare R2 bucket creation"
[5]: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/ "Cloudflare Access application setup"
[6]: https://developers.cloudflare.com/workers/configuration/secrets/ "Cloudflare Workers secrets"

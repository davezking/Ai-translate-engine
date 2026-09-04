# AI Translate Engine

English in, publication-ready Amharic out. See `architecture.md` for the full design and `CLAUDE.md` for standing project rules.

## First-time setup

1. `npm install`
2. Create the Cloudflare resources (requires `wrangler login` against the target account):
   ```
   npx wrangler d1 create ai-translate-engine-db
   npx wrangler vectorize create ai-translate-engine-corrections --dimensions=768 --metric=cosine
   ```
   Copy the returned `database_id` into `wrangler.toml` under `[[d1_databases]]`.
3. Apply migrations locally: `npm run db:migrate:local`
4. Copy `.dev.vars.example` to `.dev.vars` and fill in `GEMINI_API_KEY` (never commit this file). `DEV_BYPASS_EMAIL` lets you hit `/api/*` locally without a real Cloudflare Access session — see below.
5. `npm run dev` — serves the SPA and `/api/*` together on http://localhost:8788.

## Auth (Cloudflare Access)

Every `/api/*` route is gated by `functions/api/_middleware.ts`, which verifies the Cloudflare Access JWT (`functions/lib/auth.ts`), looks the email up in D1 `users`, and attaches `{ id, email, role }` to the request. Admin-only routes additionally call `requireAdmin(context.data.user)` (see `functions/api/admin/whoami.ts` for the pattern) — this is what gates the prompt engine (`/api/prompts/*`) and style management (`/api/styles`, `/api/styles/:id/*`). Style _selection_ (`GET /api/styles/approved`, `PATCH /api/articles/:id/style`) is deliberately open to any authenticated user: it only points an article at an already-approved profile.

- **Deployed:** set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (Pages project env vars, or uncomment `[vars]` in `wrangler.toml`) to match the Access application protecting this app. Required — without them the app fails closed to the dev-only bypass below, which only ever activates when both are unset.
- **Local dev:** leave `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` unset and set `DEV_BYPASS_EMAIL` in `.dev.vars` to one of the seeded user emails (see `migrations/0002_seed_prompts_and_users.sql`) to simulate being signed in as them. The bypass is honoured **only** for requests arriving on a local hostname (`localhost`, `127.0.0.1`, `::1`), so an environment that is missing the `ACCESS_*` vars fails closed and logs why, rather than serving `/api/*` to the internet as that identity.

## Deploying

A first deployment in order, with what to check at each step. Two of these steps
cannot be undone — read **One-way doors** before running anything.

### Before you start

- A Cloudflare account with Pages, D1, Vectorize and Workers AI available.
- `npx wrangler login`, authenticated against that account.
- A Google Gemini API key.
- Both Cloudflare Access email addresses decided — the admin and the reviewer.
- A Cloudflare Access application in front of the Pages project, and its **team
  domain** and **AUD tag** to hand.

### One-way doors

**`migrations/0002_seed_prompts_and_users.sql` still contains
`REPLACE_WITH_SECOND_USER_EMAIL`.** Replace it with the real reviewer email
_before_ the first `npm run db:migrate:remote`. Once a migration is applied it
must never be edited (see `CLAUDE.md`), so afterwards the only fix is a new
migration. `test/db/schema.test.ts` pins the placeholder deliberately, so it
fails the moment you change it — update the expected value in the same commit,
or CI goes red.

**The Vectorize index dimension is fixed at creation.** It must be 768 to match
`EMBEDDING_MODEL` (`@cf/baai/bge-base-en-v1.5`) in `functions/lib/env.ts`. A
mismatch is caught and refused rather than silently corrupting the index, but
correcting it means recreating the index and re-embedding every stored
correction.

### 1. Provision

```
npx wrangler d1 create ai-translate-engine-db
npx wrangler vectorize create ai-translate-engine-corrections --dimensions=768 --metric=cosine
```

Copy the returned `database_id` into `wrangler.toml` under `[[d1_databases]]`,
and commit it. The Workers AI binding (`AI`) needs no provisioning — it is
declared in `wrangler.toml` and resolves at runtime.

### 2. Configure

On the Pages project, under **Settings → Variables and Secrets**:

| Name                     | Kind                | Value                                                                                                                       |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`         | Secret (encrypted)  | Your Gemini API key                                                                                                         |
| `ACCESS_TEAM_DOMAIN`     | Variable            | e.g. `my-team.cloudflareaccess.com`                                                                                         |
| `ACCESS_AUD`             | Variable            | The Access application's AUD tag                                                                                            |
| `QA_RETRIEVAL_TOP_N`     | Variable (optional) | Defaults to 4; clamped to 1–20                                                                                              |
| `QA_RETRIEVAL_MIN_SCORE` | Variable (optional) | Defaults to 0 (permissive); clamped to [-1, 1]. Tune up once seed data shows real match scores — see `functions/lib/env.ts` |

The secret can also be set with `npx wrangler pages secret put GEMINI_API_KEY`.
It is never committed and is readable only from server routes.

**Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` on every environment, previews
included.** An environment missing either one has no authentication configured,
so every `/api/*` route fails closed with a 401 and an explanatory line in the
logs. That is deliberate — but a preview deployment that silently skipped the
project-level variables will look broken rather than protected.

`ACCESS_TEAM_DOMAIN` must also match the `iss` claim Access stamps on real
tokens, since the verifier checks the issuer. A scheme prefix or trailing slash
is tolerated; an otherwise different value rejects every token.

### 3. Migrate

```
npm run db:migrate:remote
```

Applies every migration in `migrations/` that the remote D1 hasn't seen yet
(wrangler tracks which are already applied, so re-running is a no-op). This is
the irreversible step — see **One-way doors** above. Confirm the reviewer email
is real before running it.

You can run this by hand, but you don't have to: `npm run deploy` runs it for
you (next step).

### 4. Deploy

```
npm run deploy
```

Applies any pending remote migrations, then builds the SPA and deploys it with
the Pages Functions in `functions/`. Migrations run **before** the code ships,
so the schema is never left lagging behind code that expects it — the failure
mode that produces `D1_ERROR: no such column: …` at runtime when a new
column-referencing route goes live against a DB that never got the migration.
All migrations here are additive, nullable `ADD COLUMN`s, so applying them ahead
of the deploy is safe: the currently-live code simply ignores the new column.

If a deploy has already shipped code that references a column the remote DB is
missing, run `npm run db:migrate:remote` on its own to reconcile immediately —
no rebuild needed.

### 5. Verify

Every `/api/*` route is behind Access, `/api/health` included, so these checks
need a signed-in browser session — a bare `curl` gets an Access challenge, not
your app.

1. **Sign in.** Visit the deployed URL. Access should challenge you, then let
   you through as one of the two seeded emails. If you are challenged in a loop,
   or every request 401s, re-check step 2.
2. **Bindings.** Open `/api/health`. All four of `DB`, `VECTORIZE`, `AI` and
   `GEMINI_API_KEY` must be `true`. Any `false` is a missing binding or secret,
   not a code problem.
3. **Roles.** Open `/api/admin/whoami` as the admin — it returns your user row.
   Signed in as the reviewer it must return 403; that one request proves the
   whole auth chain, since the role comes from the D1 `users` row rather than
   any hardcoded list.
4. **The pipeline end to end.** Paste a short English article and run it through
   split → translate → reassemble. Reassemble triggers QA automatically. A
   successful QA'd draft proves Gemini, D1 and the `prompts` table are all
   wired; Ge'ez should render correctly in the editor, with no mojibake.
5. **Finalize one article.** This exercises the compare and the D1 + Vectorize
   write together. Afterwards the article should carry a `fix_count`, and
   `correction_status` should read `captured` rather than `pending`.

### 6. Seed the correction library

Retrieval only earns its keep once the library has real content. As the admin,
open **Seed intake** (`#/seed`) and load the 50+ (English, AI translation,
human-final) triples. Each runs the same compare and capture path as a live
finalize.

To confirm retrieval is working afterwards, run QA on an article and check the
response's `retrievedCorrectionIds`, or the server log line:

```
QA retrieval for article <id>: topN=4, retrieved=3 [<id>@0.812, ...]
```

`retrieved=0` on a seeded library means retrieval is degraded — the QA pass
still succeeds with general judgement, and the response carries a
`retrievalError` when that is why.

### Rolling back

| What went wrong                          | How to undo it                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bad deployment                         | Cloudflare Pages keeps previous deployments — roll back from the dashboard. No rebuild needed.                                                                 |
| A bad prompt                             | Use the Prompt engine's rollback control, or `POST /api/prompts/:key/rollback`. It repoints at an older version; nothing is deleted and no deploy is involved. |
| A bad env var or secret                  | Change it in the dashboard and redeploy.                                                                                                                       |
| An applied migration                     | Not reversible. Fix forward with a new migration.                                                                                                              |
| A captured correction or embedded vector | Not reversible from the UI.                                                                                                                                    |

### Operational notes

- **Autosave** is debounced to two minutes (`AUTOSAVE_DEBOUNCE_MS` in
  `src/ReviewStage.tsx`) and skips unchanged text, which is what keeps reviewer
  editing inside the D1 free-tier write budget. Do not lower it.
- **Every Gemini call is server-side**, one per chunk for translation plus one
  per QA pass and one per finalize compare. A long article is a proportional
  number of calls.
- **Logs** are in the Cloudflare dashboard under the Pages project. QA
  retrieval, correction-capture deferrals and refused dev-bypass attempts all
  log there with enough context to identify the article.

## Scripts

- `npm run dev` — Vite + Pages Functions together via `wrangler pages dev`.
- `npm run build` — production frontend build.
- `npm run lint` / `npm run format` — ESLint / Prettier.
- `npm run typecheck` — TypeScript project references (app + functions + tests).
- `npm test` / `npm run test:watch` — Vitest suite.
- `npm run db:migrate:local` / `npm run db:migrate:remote` — apply D1 migrations.
- `npm run deploy` — build and deploy to Cloudflare Pages.

## Tests

`npm test` runs the Vitest suite in `test/`. **Node 22 or newer is required** — the
database tests use the built-in `node:sqlite` module.

Nothing in the suite reaches the network or a real Cloudflare binding:

- **`test/db/`** runs against an in-memory SQLite database with every file in
  `migrations/` applied in order, exposed behind the slice of the `D1Database`
  API the code actually calls (`test/helpers/d1.ts`). Because it is the real
  schema, the CHECK, UNIQUE and foreign-key constraints are under test too —
  that is how the prompt-history integrity and D1↔Vectorize consistency rules
  are covered rather than assumed.
- **`test/api/`** invokes Pages Function handlers directly with the context the
  `/api/*` middleware would have built, so the admin gating and input
  validation on each route are exercised.
- **`test/unit/`** covers pure logic (chunk-boundary guards, env parsing,
  hashing) and the Gemini-facing modules with `fetch` stubbed, which is what
  lets prompt assembly be asserted without spending an API call.
- **`test/browser/`** covers the `src/` modules that need DOM globals.

What the suite deliberately does **not** cover: real Gemini, Vectorize and
Workers AI behaviour, and the Cloudflare Access JWT path. Those need the live
bindings — see the test plans in the sprint prompt files.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and the production
build on every push to `main` and every pull request.

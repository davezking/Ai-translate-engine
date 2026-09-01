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
- **Local dev:** leave `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` unset and set `DEV_BYPASS_EMAIL` in `.dev.vars` to one of the seeded user emails (see `migrations/0002_seed_prompts_and_users.sql`) to simulate being signed in as them.

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

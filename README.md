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

Every `/api/*` route is gated by `functions/api/_middleware.ts`, which verifies the Cloudflare Access JWT (`functions/lib/auth.ts`), looks the email up in D1 `users`, and attaches `{ id, email, role }` to the request. Admin-only routes additionally call `requireAdmin(context.data.user)` (see `functions/api/admin/whoami.ts` for the pattern) — this will gate the prompt engine and style management routes once they exist.

- **Deployed:** set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (Pages project env vars, or uncomment `[vars]` in `wrangler.toml`) to match the Access application protecting this app. Required — without them the app fails closed to the dev-only bypass below, which only ever activates when both are unset.
- **Local dev:** leave `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` unset and set `DEV_BYPASS_EMAIL` in `.dev.vars` to one of the seeded user emails (see `migrations/0002_seed_prompts_and_users.sql`) to simulate being signed in as them.

## Scripts

- `npm run dev` — Vite + Pages Functions together via `wrangler pages dev`.
- `npm run build` — production frontend build.
- `npm run lint` / `npm run format` — ESLint / Prettier.
- `npm run typecheck` — TypeScript project references (app + functions).
- `npm run db:migrate:local` / `npm run db:migrate:remote` — apply D1 migrations.
- `npm run deploy` — build and deploy to Cloudflare Pages.

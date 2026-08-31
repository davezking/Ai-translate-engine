# UI prototype

A clickable HTML/CSS/JS prototype of the whole app, built from `architecture.md` and the
`phase-*-sprint-*-prompts.md` files. It is a **design reference, not the implementation** —
the real app is a React SPA on Cloudflare Pages. Nothing here talks to a network.

Open `index.html` in a browser. No build step, no dependencies.

## Files

| File | What it is |
|---|---|
| `styles.css` | The design system: tokens, components, light/dark themes. Port the `:root` token block into the React app and the rest follows. |
| `data.js` | Mock data shaped like the D1 tables in architecture.md §4 and the API responses in §5. Swap for real `/api/*` fetches. |
| `app.js` | Views, routing and interactions. Every place that would call the API is marked with an `// API:` comment naming the endpoint. |
| `index.html` | App shell — rail, topbar, view mount point. |

## Screens, and the sprint each belongs to

| Route | Screen | Sprint |
|---|---|---|
| `#/articles` | Article list, status, fix counts | 1.2 |
| `#/new` | Paste-only ingest, style selection, word/chunk estimate | 1.2 / 4.1 |
| `#/a/:id/split` | Boundary editor: merge, split, undo/redo, translation-impact preview | 1.2 |
| `#/a/:id/translate` | Per-chunk status, per-chunk retry, translate-all, failure isolation | 1.2 |
| `#/a/:id/qa` | QA run, retrieved lessons with scores, assembled prompt preview | 3.2 |
| `#/a/:id/review` | Side-by-side editor, autosave, offline buffer, restore-on-reload, finalize | 2.1 |
| `#/a/:id/final` | Gemini compare result: change summary, fix count, library write | 3.1 |
| `#/metrics` | Fixes-per-article trend with baseline band and trend line | 3.2 |
| `#/styles`, `#/styles/:id` | Derive profile, guidelines, A/B tone check, approve | 4.1 |
| `#/prompts/:key` | Prompt editor, publish, version history, rollback | 4.2 |
| `#/seeds` | Seed triple intake, batch mode, running count | 3.1 |

## What the prototype deliberately encodes

These are the behaviours from `CLAUDE.md` that a UI can get wrong, so they are shown explicitly:

- **Never lose reviewer work.** Edits buffer to `localStorage` on every keystroke; the save
  indicator distinguishes saved / unsaved / saving / offline; reload shows a restore banner
  naming how old the recovered edits are, with an explicit way to discard them.
- **Autosave is debounced, not per-keystroke.** The prototype uses a 6-second debounce so it
  can be demonstrated in a sitting; the real app uses the minutes-order interval the D1
  free-tier write budget requires. Only the timing constant changes.
- **One chunk failing never fails the article.** Failed chunks render inline with their error
  and their own retry control; siblings are untouched.
- **A translated chunk is not re-translated** unless you explicitly ask (`Re-translate`), or
  unless its boundaries changed — see below.
- **Prompt history is immutable.** Publishing prepends a version; rollback repoints which
  version is current and the version count never drops. Both are visible in the UI copy.
- **Ge'ez rendering.** Amharic is set in Noto Sans Ethiopic at a larger size and looser line
  height than the Latin UI. Nothing in the UI counts characters to measure edits — the fix
  count comes from the Gemini comparison.
- **Admin-gated screens are labelled** as such (styles, prompts, seeds).

## The boundary editor

Chunks are never stored as text. The article is a list of **paragraphs**, and `boundaries` is
the list of paragraph indices each chunk starts at. Chunks are derived from the two
(`DB.buildChunks`). This falls out of the split prompt's own constraint — a break may only land
on a paragraph boundary — so the UI physically cannot express a cut the pipeline could not make.

Editing is therefore only ever adding or removing one boundary:

- **Merge** removes the boundary between a chunk and the one above it. Disabled, with the reason
  in the tooltip, when the result would exceed the 900-word hard cap.
- **Split here** appears in the gap between two paragraphs inside a chunk and adds a boundary.
- **Undo / redo** (`⌘Z` / `⌘⇧Z`) walk a history stack of boundary arrays.
- **AI proposal** restores the split Gemini returned, which is kept alongside the working set.

**Translation impact is shown before you commit.** A chunk's identity is its paragraph
composition — the prototype's stand-in for hashing its source text. Translations are stored
against that identity, so a chunk whose boundaries changed genuinely has no translation and is
marked *needs translation*, while every untouched chunk keeps its own and is never re-run. The
toolbar counts kept vs. to-translate live, and a warning banner names how many translations the
pending edit would cost. Nothing is written until Save.

Chunk size is judged against the range in the split prompt (500–800, hard cap 900). "Short" is
only flagged when there is more than one chunk — a single chunk holding the whole article cannot
be made longer, so flagging it would be noise.

## Keyboard

`⌘K` / `Ctrl-K` command palette · `⌘S` force-save in the editor · `⌘Z` / `⌘⇧Z` undo/redo in the
boundary editor · `Esc` close.

## Known stand-ins

Fonts load from Google Fonts with a system fallback; the pipeline uses timeouts instead of
network calls; article and paragraph data is fixed. The style-guidelines editor signals intent
via a toast rather than full editing.

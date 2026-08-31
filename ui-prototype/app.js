/* =============================================================================
   Translation Engine — UI prototype
   All state is in-memory; every mutation that would hit `/api/*` in the real
   app is marked with an `// API:` comment naming the endpoint from
   architecture.md §5.
   ============================================================================= */
'use strict';

/* --- tiny helpers -------------------------------------------------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));

function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
const shortDate = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const words = t => (t.trim() ? t.trim().split(/\s+/).length : 0);

/* --- icons --------------------------------------------------------------- */
const I = {
  list:    'M2.5 4h11M2.5 8h11M2.5 12h7',
  plus:    'M8 3.5v9M3.5 8h9',
  chart:   'M2.5 13V7M6.5 13V3.5M10.5 13V9.5M14 13H2',
  brush:   'M4 12s.5-2 2-2 2 1 3.5 1 2.5-1.5 2.5-3.5S10.5 3 8.5 3 4 5 4 8z',
  code:    'M6 4.5 2.5 8 6 11.5M10 4.5 13.5 8 10 11.5',
  seed:    'M8 13.5V7m0 0c0-2.5 2-4.5 5-4.5 0 3-2 4.5-5 4.5Zm0 0C8 4.8 6.2 3 3.5 3 3.5 5.7 5.3 7 8 7Z',
  doc:     'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  check:   'M3.5 8.5l3 3 6-6.5',
  x:       'M4 4l8 8M12 4l-8 8',
  retry:   'M13 8a5 5 0 1 1-1.6-3.7M13 3v2.5h-2.5',
  play:    'M5 3.5l7 4.5-7 4.5z',
  search:  'M10.2 10.2 14 14',
  warn:    'M8 2.5 14.5 13.5h-13zM8 6.5v3M8 11.3v.2',
  info:    'M8 7.5v4M8 5v.2M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
  save:    'M3 3h7l3 3v7H3zM5.5 3v3.5h5V3M5.5 13V9.5h5V13',
  clock:   'M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z',
  back:    'M9.5 3.5 5 8l4.5 4.5',
  merge:   'M4 3v4c0 2 1.5 3 3 3h5M12 10l-2-2M12 10l-2 2',
  split:   'M3 8h4m0 0 3-3m-3 3 3 3M9.5 8H13',
  lock:    'M4.5 7V5.5a3.5 3.5 0 0 1 7 0V7M3.5 7h9v6h-9z',
  history: 'M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 3v3.5H6M8 5.5V8l2 1.5'
};
const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"><path d="${I[name] || ''}"/></svg>`;

/* --- status vocabulary --------------------------------------------------- */
const STATUS = {
  drafted:     { label: 'Drafted',     cls: '' },
  splitting:   { label: 'Splitting',   cls: 'pill-info' },
  split:       { label: 'Split',       cls: 'pill-info' },
  translating: { label: 'Translating', cls: 'pill-info' },
  translated:  { label: 'Translated',  cls: 'pill-info' },
  qa:          { label: 'QA’d',        cls: 'pill-accent' },
  review:      { label: 'In review',   cls: 'pill-warn' },
  final:       { label: 'Final',       cls: 'pill-ok' },
  failed:      { label: 'Failed',      cls: 'pill-danger' },
  pending:     { label: 'Pending',     cls: '' },
  done:        { label: 'Done',        cls: 'pill-ok' }
};
const pill = st => {
  const s = STATUS[st] || { label: st, cls: '' };
  return `<span class="pill ${s.cls}">${esc(s.label)}</span>`;
};

/* --- toasts -------------------------------------------------------------- */
function toast(msg, kind = 'ok', ms = 3600) {
  const glyph = kind === 'err' ? 'warn' : kind === 'info' ? 'info' : 'check';
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(glyph)}<span>${esc(msg)}</span>
    <button class="close" aria-label="Dismiss">${icon('x')}</button>`;
  el.querySelector('.close').onclick = () => el.remove();
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

/* --- overlay (modals + palette) ------------------------------------------ */
function closeOverlay() { $('#overlay').innerHTML = ''; }
function openOverlay(html, { onMount, wide } = {}) {
  const ov = $('#overlay');
  ov.innerHTML = `<div class="scrim"><div class="modal${wide ? ' lg' : ''}">${html}</div></div>`;
  ov.querySelector('.scrim').addEventListener('mousedown', e => {
    if (e.target === e.currentTarget) closeOverlay();
  });
  $$('[data-close]', ov).forEach(b => b.onclick = closeOverlay);
  onMount?.(ov);
}
function confirmDialog({ title, body, confirm = 'Confirm', danger, onConfirm }) {
  openOverlay(`
    <div class="modal-head">
      <div class="modal-title">${esc(title)}</div>
      <div class="modal-sub">${body}</div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="ok">${esc(confirm)}</button>
    </div>`, {
    onMount: ov => { $('#ok', ov).onclick = () => { closeOverlay(); onConfirm(); }; }
  });
}

/* --- theme --------------------------------------------------------------- */
(function theme() {
  let saved = null;
  try { saved = localStorage.getItem('te-theme'); } catch {}
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = mode;
  addEventListener('DOMContentLoaded', () => {
    const t = $('#theme-toggle');
    t.checked = mode === 'dark';
    t.onchange = () => {
      const m = t.checked ? 'dark' : 'light';
      document.documentElement.dataset.theme = m;
      try { localStorage.setItem('te-theme', m); } catch {}
    };
  });
})();

/* --- navigation ---------------------------------------------------------- */
const NAV_MAIN = [
  { route: 'articles', label: 'Articles', icon: 'list', count: () => DB.articles.length },
  { route: 'metrics',  label: 'Fixes trend', icon: 'chart' }
];
const NAV_ADMIN = [
  { route: 'styles',  label: 'Writer styles', icon: 'brush', count: () => DB.styles.length },
  { route: 'prompts', label: 'Prompt engine', icon: 'code' },
  { route: 'seeds',   label: 'Seed intake',   icon: 'seed', count: () => DB.corrections_total }
];

function renderNav() {
  const cur = location.hash.slice(2).split('/')[0] || 'articles';
  const draw = (items, host) => {
    host.innerHTML = items.map(it => `
      <button class="nav-item" data-route="${it.route}"
              ${cur === it.route || (cur === 'a' && it.route === 'articles') ? 'aria-current="page"' : ''}>
        ${icon(it.icon)}<span>${it.label}</span>
        ${it.count ? `<span class="count">${it.count()}</span>` : ''}
      </button>`).join('');
  };
  draw(NAV_MAIN, $('#nav-main'));
  draw(NAV_ADMIN, $('#nav-admin'));
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-route]');
  if (b) { location.hash = '#/' + b.dataset.route; }
});

/* --- command palette ----------------------------------------------------- */
function paletteCommands() {
  const cmds = [
    { sec: 'Go to', label: 'Articles',       icon: 'list',  go: '#/articles' },
    { sec: 'Go to', label: 'New article',    icon: 'plus',  go: '#/new' },
    { sec: 'Go to', label: 'Fixes trend',    icon: 'chart', go: '#/metrics' },
    { sec: 'Go to', label: 'Writer styles',  icon: 'brush', go: '#/styles',  where: 'Admin' },
    { sec: 'Go to', label: 'Prompt engine',  icon: 'code',  go: '#/prompts', where: 'Admin' },
    { sec: 'Go to', label: 'Seed intake',    icon: 'seed',  go: '#/seeds',   where: 'Admin' }
  ];
  DB.articles.forEach(a => cmds.push({
    sec: 'Articles', label: a.title, icon: 'doc',
    go: `#/a/${a.id}/${a.status === 'final' ? 'final' : a.status === 'review' ? 'review' : 'split'}`,
    where: STATUS[a.status]?.label || a.status
  }));
  return cmds;
}

function openPalette() {
  const cmds = paletteCommands();
  openOverlay(`
    <div class="palette-input">
      ${icon('search')}<input id="pq" placeholder="Search articles, jump to a screen…" autocomplete="off" />
      <kbd>esc</kbd>
    </div>
    <div class="palette-list" id="plist"></div>`, {
    onMount: ov => {
      ov.querySelector('.modal').classList.add('palette');
      const q = $('#pq', ov), list = $('#plist', ov);
      let sel = 0, shown = [];
      const draw = () => {
        const term = q.value.trim().toLowerCase();
        shown = cmds.filter(c => !term || c.label.toLowerCase().includes(term));
        let html = '', lastSec = '';
        shown.forEach((c, i) => {
          if (c.sec !== lastSec) { html += `<div class="palette-sec">${c.sec}</div>`; lastSec = c.sec; }
          html += `<button class="palette-item" data-i="${i}" data-active="${i === sel}">
            ${icon(c.icon)}<span>${esc(c.label)}</span>
            ${c.where ? `<span class="where">${esc(c.where)}</span>` : ''}</button>`;
        });
        list.innerHTML = html || `<div class="empty" style="padding:26px">No matches</div>`;
        $$('.palette-item', list).forEach(b => b.onclick = () => run(shown[+b.dataset.i]));
        list.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
      };
      const run = c => { closeOverlay(); if (c) location.hash = c.go; };
      q.oninput = () => { sel = 0; draw(); };
      q.onkeydown = e => {
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
        if (e.key === 'ArrowUp')   { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
        if (e.key === 'Enter')     { run(shown[sel]); }
      };
      draw(); q.focus();
    }
  });
}

addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  if (e.key === 'Escape') closeOverlay();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (typeof window.__forceSave === 'function') window.__forceSave();
  }
});

/* =============================================================================
   Router
   ============================================================================= */
const VIEW = $('#view');
const SCROLL = $('#scroll');

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'articles', a: parts[1], b: parts[2] };
}

function crumbs(items) {
  $('#crumbs').innerHTML = items.map((it, i) =>
    (i ? '<span class="sep">/</span>' : '') +
    (it.go ? `<span class="crumb-link" data-go="${it.go}">${esc(it.label)}</span>`
           : `<b>${esc(it.label)}</b>`)).join('');
  $$('#crumbs [data-go]').forEach(el => el.onclick = () => location.hash = el.dataset.go);
}

const ROUTES = {};
function route() {
  const { name, a, b } = parseHash();
  const fn = ROUTES[name] || ROUTES.articles;
  VIEW.innerHTML = '';
  fn(a, b);
  renderNav();
  SCROLL.scrollTop = 0;
}
addEventListener('hashchange', route);
addEventListener('DOMContentLoaded', () => {
  $('#open-palette').onclick = openPalette;
  $('#user-chip').onclick = () => toast('Identity comes from Cloudflare Access — there is no in-app login.', 'info');
  $('#user-mail').textContent = DB.user.email;
  $('#user-initials').textContent = DB.user.email.slice(0, 2).toUpperCase();
  $('#user-role').textContent = `${DB.user.role === 'admin' ? 'Admin' : 'Reviewer'} · Cloudflare Access`;
  if (!location.hash) location.hash = '#/articles';
  route();
});

/* =============================================================================
   View — Articles list
   ============================================================================= */
ROUTES.articles = () => {
  crumbs([{ label: 'Articles' }]);
  let filter = 'all', term = '';

  VIEW.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Articles</h1>
          <p class="page-sub">Paste English, run the pipeline, review the Amharic. Every finalized article
            feeds the correction library that QA reads from next time.</p>
        </div>
        <div class="actions">
          <button class="btn btn-primary" data-route="new">${icon('plus')} New article</button>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:20px">
        <div class="card stat">
          <div class="stat-label">In flight</div>
          <div class="stat-value">${DB.articles.filter(a => !['final', 'drafted'].includes(a.status)).length}</div>
          <div class="stat-foot">across split, translate and review</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Finalized</div>
          <div class="stat-value">${DB.finalized.length}</div>
          <div class="stat-foot">all time</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Avg fixes · last 3</div>
          <div class="stat-value">${avgFixes(3)}</div>
          <div class="stat-foot"><span class="trend-down">↓ ${Math.round((1 - avgFixes(3) / avgFixes(3, true)) * 100)}%</span> vs. first 3</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Correction library</div>
          <div class="stat-value">${DB.corrections_total}</div>
          <div class="stat-foot">${DB.corrections_seeded} seeded · ${DB.corrections_total - DB.corrections_seeded} live</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div class="search">
            ${icon('search')}<input id="q" placeholder="Filter by title or id…" />
          </div>
          <div class="actions">
            <div class="seg" id="seg">
              <button data-f="all" aria-pressed="true">All</button>
              <button data-f="active" aria-pressed="false">Active</button>
              <button data-f="final" aria-pressed="false">Final</button>
            </div>
          </div>
        </div>
        <div id="rows"></div>
      </div>
    </div>`;

  const draw = () => {
    const rows = DB.articles.filter(a => {
      if (filter === 'active' && ['final'].includes(a.status)) return false;
      if (filter === 'final' && a.status !== 'final') return false;
      const t = term.toLowerCase();
      return !t || a.title.toLowerCase().includes(t) || a.id.includes(t);
    }).sort((a, b) => b.updated_at - a.updated_at);

    $('#rows').innerHTML = rows.length ? `
      <table class="table">
        <thead><tr>
          <th style="width:46%">Article</th><th>Status</th><th>Style</th>
          <th class="num">Words</th><th class="num">Fixes</th><th class="num">Updated</th>
        </tr></thead>
        <tbody>${rows.map(a => `
          <tr data-id="${a.id}" data-status="${a.status}">
            <td>
              <div class="t-title">${esc(a.title)}</div>
              <div class="t-meta mono">${a.id} · ${a.chunks} chunk${a.chunks === 1 ? '' : 's'}</div>
            </td>
            <td>${pill(a.status)}</td>
            <td class="small dim">${esc(styleName(a.writer_style_id))}</td>
            <td class="num small dim">${a.words ? a.words.toLocaleString() : '—'}</td>
            <td class="num" style="font-variant-numeric:tabular-nums">${a.fix_count ?? '<span class="muted">—</span>'}</td>
            <td class="num small dim nowrap">${ago(a.updated_at)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : `
      <div class="empty">
        ${icon('doc')}<h3>Nothing here</h3><p>No article matches that filter.</p>
      </div>`;

    $$('#rows tbody tr').forEach(tr => tr.onclick = () => openArticle(tr.dataset.id, tr.dataset.status));
  };

  $('#q').oninput = e => { term = e.target.value; draw(); };
  $$('#seg button').forEach(b => b.onclick = () => {
    filter = b.dataset.f;
    $$('#seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    draw();
  });
  draw();
};

function styleName(id) { return DB.styles.find(s => s.id === id)?.writer_name || 'None'; }
function avgFixes(n, fromStart) {
  const arr = DB.finalized.map(a => a.fix_count);
  const slice = fromStart ? arr.slice(0, n) : arr.slice(-n);
  return Math.round(slice.reduce((s, x) => s + x, 0) / slice.length * 10) / 10;
}
function openArticle(id, status) {
  if (status === 'drafted') return void (location.hash = '#/new');
  const stage = { final: 'final', review: 'review', qa: 'review',
                  translated: 'qa', translating: 'translate', split: 'split' }[status] || 'split';
  location.hash = `#/a/${id}/${stage}`;
}

/* =============================================================================
   View — New article (paste-only ingest)
   ============================================================================= */
ROUTES.new = () => {
  crumbs([{ label: 'Articles', go: '/articles' }, { label: 'New article' }]);
  VIEW.innerHTML = `
    <div class="page" style="max-width:820px">
      <div class="page-head">
        <div>
          <h1 class="page-title">New article</h1>
          <p class="page-sub">Paste the English source. Plain text only — there is no file upload by design.</p>
        </div>
      </div>

      <div class="card card-pad stack-lg">
        <div class="field">
          <label class="label" for="title">Title <span class="muted">(internal, for the article list)</span></label>
          <input class="input" id="title" placeholder="Ethiopia’s coffee exports reach a record high" />
        </div>

        <div class="field">
          <div class="row">
            <label class="label" for="src">English source</label>
            <span class="spacer"></span>
            <span class="hint" id="wc">0 words · ~0 chunks</span>
          </div>
          <textarea class="textarea" id="src" style="min-height:300px"
            placeholder="Paste the full English article here…"></textarea>
          <span class="hint">The splitter targets 500–800 words per chunk and never breaks mid-sentence or mid-quote.</span>
        </div>

        <div class="grid grid-2">
          <div class="field">
            <label class="label" for="style">Writer style</label>
            <select class="select" id="style">
              <option value="">No style — plain QA</option>
              ${DB.styles.filter(s => s.approved).map(s =>
                `<option value="${s.id}">${esc(s.writer_name)}</option>`).join('')}
            </select>
            <span class="hint">Only approved profiles are selectable. Applied at the QA step.</span>
          </div>
          <div class="field">
            <label class="label">Pipeline</label>
            <div class="row wrap small dim" style="gap:6px;padding-top:6px">
              <span class="tag">split</span>→<span class="tag">translate</span>→
              <span class="tag">reassemble</span>→<span class="tag">QA</span>→
              <span class="tag">review</span>→<span class="tag">finalize</span>
            </div>
          </div>
        </div>

        <div class="row">
          <span class="hint">Creating the article runs <span class="mono">POST /api/articles</span>, then the AI split.</span>
          <span class="spacer"></span>
          <button class="btn btn-lg btn-primary" id="start" disabled>${icon('play')} Split into chunks</button>
        </div>
      </div>
    </div>`;

  const src = $('#src'), start = $('#start');
  src.oninput = () => {
    const w = words(src.value);
    $('#wc').textContent = `${w.toLocaleString()} words · ~${Math.max(1, Math.round(w / 650))} chunk${w > 900 ? 's' : ''}`;
    start.disabled = w < 20;
  };
  start.onclick = async () => {
    // API: POST /api/articles  →  POST /api/articles/:id/split
    start.innerHTML = `<span class="spin"></span> Splitting…`;
    start.disabled = true;
    await wait(1100);
    toast('Article created and split into 4 chunks.');
    location.hash = '#/a/art_9fa21c/split';
  };
  src.value = '';
};

/* =============================================================================
   Workspace shell — stepper across the pipeline
   ============================================================================= */
const STAGES = [
  { key: 'split',     name: 'Split',     meta: 'boundaries' },
  { key: 'translate', name: 'Translate', meta: 'per chunk' },
  { key: 'qa',        name: 'QA',        meta: 'tone + lessons' },
  { key: 'review',    name: 'Review',    meta: 'human edit' },
  { key: 'final',     name: 'Final',     meta: 'compare + store' }
];
const PROGRESS = { drafted: 0, split: 1, translating: 1, translated: 2, qa: 3, review: 3, final: 5 };

function workspaceShell(article, stageKey, bodyHTML) {
  const prog = PROGRESS[article.status] ?? 0;
  const idx = STAGES.findIndex(s => s.key === stageKey);
  crumbs([{ label: 'Articles', go: '/articles' }, { label: article.title }]);

  VIEW.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div style="min-width:0">
          <h1 class="page-title">${esc(article.title)}</h1>
          <div class="row small dim" style="margin-top:5px;gap:8px">
            <span class="mono">${article.id}</span><span class="muted">·</span>
            ${pill(article.status)}<span class="muted">·</span>
            <span>${article.words.toLocaleString()} words</span><span class="muted">·</span>
            <span>style: ${esc(styleName(article.writer_style_id))}</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn" data-route="articles">${icon('back')} All articles</button>
        </div>
      </div>

      <div class="stepper" style="margin-bottom:20px">
        ${STAGES.map((s, i) => {
          const done = i < prog, active = i === idx;
          const cls = [done ? 'done' : '', active ? 'active' : '', i > prog && !active ? 'ahead' : ''].join(' ');
          const glyph = done ? icon('check') : i + 1;
          return `<button class="step ${cls}" data-stage="${s.key}" ${active ? 'aria-current="step"' : ''}>
            <span class="step-dot">${glyph}</span>
            <span class="step-text"><span class="step-name">${s.name}</span><span class="step-meta">${s.meta}</span></span>
          </button>`;
        }).join('')}
      </div>

      <div id="stage-body">${bodyHTML}</div>
    </div>`;

  $$('.step').forEach(b => b.onclick = () => location.hash = `#/a/${article.id}/${b.dataset.stage}`);
}

ROUTES.a = (id, stage = 'split') => {
  const article = DB.articles.find(x => x.id === id) || DB.articles[0];
  ({ split: stageSplit, translate: stageTranslate, qa: stageQA, review: stageReview, final: stageFinal }
    [stage] || stageSplit)(article);
};

/* --- Stage 1: split ------------------------------------------------------ */
function stageSplit(article) {
  const chunks = DB.chunks[article.id] || [];
  const body = `
    <div class="banner banner-info" style="margin-bottom:14px">
      ${icon('info')}
      <span>Gemini proposed these boundaries from the <b>split</b> prompt (v${DB.prompts.split.current}).
        Adjust them before translating — merging or splitting here is free, re-translating is not.</span>
    </div>

    <div class="section-head">
      <span class="section-title">${chunks.length} chunks</span>
      <span class="small muted">${chunks.reduce((s, c) => s + c.words, 0)} words total ·
        avg ${Math.round(chunks.reduce((s, c) => s + c.words, 0) / chunks.length)} per chunk</span>
      <div class="actions">
        <button class="btn btn-sm" id="reset">${icon('retry')} Re-run split</button>
        <button class="btn btn-sm btn-primary" id="next">Save boundaries &amp; continue</button>
      </div>
    </div>

    <div id="chunklist">
      ${chunks.map((c, i) => `
        ${i ? `<div class="boundary"><button data-merge="${i}">${icon('merge')} merge with previous</button></div>` : ''}
        <div class="chunk">
          <div class="chunk-head">
            <span class="chunk-ord">${c.ord}</span>
            <span class="chunk-words">${c.words} words</span>
            ${c.words > 210 ? '<span class="pill pill-warn">long</span>' : ''}
            <div class="actions">
              <button class="btn btn-sm btn-ghost" data-split="${i}">${icon('split')} split here</button>
            </div>
          </div>
          <div class="chunk-body">${esc(c.english_text)}</div>
        </div>`).join('')}
    </div>

    <p class="hint" style="margin-top:14px">
      Saving writes to <span class="mono">PUT /api/articles/:id/chunks</span>. Chunk text is hashed, so a chunk
      you don’t touch is never re-translated.
    </p>`;

  workspaceShell(article, 'split', body);

  $$('[data-merge]').forEach(b => b.onclick = () => toast('Boundary merged — chunk hashes recomputed.', 'info'));
  $$('[data-split]').forEach(b => b.onclick = () => toast('Split point added. Pick the paragraph to break at.', 'info'));
  $('#reset').onclick = () => confirmDialog({
    title: 'Re-run the AI split?',
    body: 'Any boundary you adjusted by hand will be replaced by a fresh proposal. Chunks already translated keep their Amharic text if their English is unchanged.',
    confirm: 'Re-run split',
    onConfirm: () => toast('Split re-run queued.', 'info')
  });
  $('#next').onclick = () => { location.hash = `#/a/${article.id}/translate`; };
}

/* --- Stage 2: per-chunk translate ---------------------------------------- */
function stageTranslate(article) {
  const chunks = DB.chunks[article.id] || [];
  const body = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-pad row">
        <div style="flex:1;min-width:0">
          <div class="row" style="margin-bottom:7px">
            <span class="small" style="font-weight:560">Translation progress</span>
            <span class="spacer"></span>
            <span class="small dim" id="prog-text"></span>
          </div>
          <div class="bar"><i id="prog-bar" style="width:0%"></i></div>
        </div>
        <div class="row" style="flex:none;gap:8px">
          <button class="btn" id="retry-failed">${icon('retry')} Retry failed</button>
          <button class="btn btn-primary" id="run-all">${icon('play')} Translate all remaining</button>
        </div>
      </div>
    </div>

    <div class="banner banner-warn" id="fail-banner" hidden style="margin-bottom:14px">
      ${icon('warn')}
      <span><b>1 chunk failed.</b> The rest of the article is untouched — a failed chunk never fails the article.</span>
      <span class="actions"><button class="btn btn-sm" id="retry-failed-2">Retry it</button></span>
    </div>

    <div id="chunklist"></div>

    <p class="hint" style="margin-top:14px">
      Each chunk is one call to <span class="mono">POST /api/articles/:id/chunks/:ord/translate</span>, driven
      sequentially by the client so every request stays short and any single chunk can be retried on its own.
    </p>`;

  workspaceShell(article, 'translate', body);

  const state = chunks.map(c => ({ ...c }));

  const draw = () => {
    const done = state.filter(c => c.status === 'done').length;
    const failed = state.filter(c => c.status === 'failed').length;
    $('#prog-bar').style.width = `${Math.round(done / state.length * 100)}%`;
    $('#prog-bar').parentElement.classList.toggle('ok', done === state.length);
    $('#prog-text').textContent = `${done} of ${state.length} translated${failed ? ` · ${failed} failed` : ''}`;
    $('#fail-banner').hidden = !failed;
    $('#retry-failed').disabled = !failed;

    $('#chunklist').innerHTML = state.map((c, i) => `
      <div class="chunk ${c.status === 'failed' ? 'failed' : ''}">
        <div class="chunk-head">
          <span class="chunk-ord">${c.ord}</span>
          <span class="chunk-words">${c.words} words</span>
          ${c.status === 'translating'
            ? `<span class="pill plain pill-info"><span class="spin" style="width:9px;height:9px"></span>Translating</span>`
            : pill(c.status)}
          <div class="actions">
            ${c.status === 'done'
              ? `<button class="btn btn-sm btn-ghost" data-re="${i}">${icon('retry')} Re-translate</button>`
              : `<button class="btn btn-sm ${c.status === 'failed' ? 'btn-primary' : ''}" data-go="${i}"
                   ${c.status === 'translating' ? 'disabled' : ''}>
                   ${icon(c.status === 'failed' ? 'retry' : 'play')} ${c.status === 'failed' ? 'Retry' : 'Translate'}</button>`}
          </div>
        </div>
        <div class="chunk-body two">
          <div>${esc(c.english_text)}</div>
          <div class="geez">${c.amharic_text
            ? esc(c.amharic_text)
            : c.status === 'translating'
              ? `<div class="skeleton" style="height:12px;width:96%"></div>
                 <div class="skeleton" style="height:12px;width:88%;margin-top:9px"></div>
                 <div class="skeleton" style="height:12px;width:92%;margin-top:9px"></div>`
              : `<span class="muted small" style="font-family:var(--ui)">Not translated yet</span>`}</div>
        </div>
        ${c.error ? `<div class="chunk-error">${icon('warn')} ${esc(c.error)}</div>` : ''}
      </div>`).join('');

    $$('[data-go]').forEach(b => b.onclick = () => translateOne(+b.dataset.go));
    $$('[data-re]').forEach(b => b.onclick = () => translateOne(+b.dataset.re, true));
    $('#run-all').disabled = state.every(c => c.status === 'done');
  };

  async function translateOne(i, force) {
    const c = state[i];
    if (c.status === 'done' && !force) return;               // cost guard: skip unchanged chunks
    c.status = 'translating'; c.error = null; draw();
    // API: POST /api/articles/:id/chunks/:ord/translate
    await wait(900 + Math.random() * 700);
    c.status = 'done';
    c.amharic_text = c.amharic_text || SAMPLE_AMHARIC[c.ord] || SAMPLE_AMHARIC.fallback;
    draw();
    if (state.every(x => x.status === 'done')) {
      article.status = 'translated';
      toast('All chunks translated and reassembled into the draft.');
    }
  }

  $('#run-all').onclick = async () => {
    for (let i = 0; i < state.length; i++) if (state[i].status !== 'done') await translateOne(i);
    location.hash = `#/a/${article.id}/qa`;
  };
  const retryFailed = async () => {
    for (let i = 0; i < state.length; i++) if (state[i].status === 'failed') await translateOne(i);
  };
  $('#retry-failed').onclick = retryFailed;
  $('#retry-failed-2').onclick = retryFailed;
  draw();
}

const SAMPLE_AMHARIC = {
  3: 'የሎጂስቲክስ ሥርዓቱ አሁንም እጅግ ደካማው ማነቆ ሆኖ ቀጥሏል። ኮንቴነሮች በደረቅ ወደብ ለቀናት ተሰልፈው ይቆያሉ፤ ላኪዎችም እንደሚሉት የአንድ ጭነት መዘግየት በጠቅላላው ምርት ላይ የሚገኘውን ትርፍ ሙሉ በሙሉ ሊያጠፋ ይችላል። ባለሥልጣኑ ለተመዘገቡ ላኪዎች ዋስትና ያለው ተራ የሚሰጥ የቅድሚያ ምዝገባ ሥርዓት እንደሚዘረጋ ቢያስታውቅም፣ የሚጀመርበት ቀን እስካሁን አልተገለጸም። በሌላ በኩል የተረጋገጡ የቡና ደረጃ ሰጪ ባለሙያዎች እጥረት በመኖሩ ናሙናዎች አንዳንዴ ለአንድ ሳምንት ሳይቀመሱ ይቆያሉ፤ የውጭ ገዢዎችም የኢትዮጵያ ሻጮች እስካሁን ሊሰጡ የማይችሉትን የጊዜ ገደብ ዋስትና በተደጋጋሚ እየጠየቁ ነው።',
  4: 'ቀጣዩ ምዕራፍ የሚወሰነው በዋጋ ሳይሆን በሰነድ ሥራ ነው። የምዝገባው ዘመቻ ከቀጣዩ ምርት ወቅት በፊት አዲሶቹን ወረዳዎች የሚደርስ ከሆነ፣ አሁን በሁለት ዞኖች ብቻ የተከማቸው ተጨማሪ ጥቅም ሊስፋፋ ይችላል። ካልተሳካ ግን ሪከርዱ ለዘርፉ የመዋቅር ለውጥ ሳይሆን ለጥቂት አምራቾች ጥሩ ዓመት ሆኖ ብቻ ይመዘገባል።',
  fallback: 'የተተረጎመ የአማርኛ ጽሑፍ በዚህ ቦታ ይታያል።'
};

/* --- Stage 3: QA pass ---------------------------------------------------- */
function stageQA(article) {
  const style = DB.styles.find(s => s.id === article.writer_style_id);
  const body = `
    <div class="grid" style="grid-template-columns:1fr 340px;align-items:start">
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <h3>QA pass</h3>
            <div class="actions">
              <span class="tag">prompt: qa · v${DB.prompts.qa.current}</span>
              <button class="btn btn-sm btn-primary" id="run-qa">${icon('play')} Run QA</button>
            </div>
          </div>
          <div class="card-pad stack">
            <p class="small dim" style="line-height:1.6">
              QA rewrites the reassembled draft for grammar, wording and machine-translation stiffness. It is
              assembled from three parts: the current <b>qa</b> prompt version, the selected writer’s style
              guidelines, and the most relevant lessons retrieved from the correction library.
            </p>
            <div class="divider"></div>
            <div class="row wrap" style="gap:18px">
              <div>
                <div class="stat-label">Draft length</div>
                <div class="small" style="margin-top:3px">${article.words.toLocaleString()} words · 4 chunks reassembled</div>
              </div>
              <div>
                <div class="stat-label">Style profile</div>
                <div class="small" style="margin-top:3px">${style
                  ? `${esc(style.writer_name)} <span class="pill pill-ok" style="margin-left:4px">approved</span>`
                  : '<span class="muted">none selected</span>'}</div>
              </div>
              <div>
                <div class="stat-label">Lessons retrieved</div>
                <div class="small" style="margin-top:3px">top ${DB.lessons.length} of ${DB.corrections_total} by vector similarity</div>
              </div>
            </div>
            <div id="qa-progress" hidden>
              <div class="divider"></div>
              <div class="row small dim" style="margin-bottom:7px"><span class="spin"></span><span id="qa-step">Embedding article context…</span></div>
              <div class="bar"><i id="qa-bar" style="width:8%"></i></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Retrieved lessons</h3>
            <div class="actions"><span class="small muted">Vectorize · cosine similarity</span></div>
          </div>
          <div class="card-pad">
            ${DB.lessons.map(l => `
              <div class="lesson">
                <div class="lesson-score">${l.score.toFixed(2)}</div>
                <div>
                  <div class="lesson-text">${esc(l.summary)}</div>
                  <div class="lesson-meta">
                    <span class="tag">${esc(l.topic_tag)}</span>
                    <span class="tag">${l.id}</span>
                  </div>
                </div>
              </div>`).join('')}
            <p class="hint" style="margin-top:12px">
              These summaries came from past human corrections. They are injected into the QA prompt verbatim —
              nothing is trained or fine-tuned.
            </p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Prompt preview</h3></div>
        <div class="card-pad">
          <div class="tl-body" style="max-height:420px">${esc(
            DB.prompts.qa.versions.find(v => v.v === DB.prompts.qa.current).body
              .replace('{{RETRIEVED_LESSONS}}', `LESSONS FROM PAST CORRECTIONS:\n${DB.lessons.map((l, i) => `${i + 1}. ${l.summary}`).join('\n')}`)
              .replace('{{STYLE_GUIDELINES}}', `WRITER STYLE — ${style ? style.writer_name : 'none'}:\n${style ? style.derived_guidelines.split('\n\n').slice(0, 3).join('\n') : '(no profile selected)'}`)
          )}</div>
          <p class="hint" style="margin-top:10px">Read from the <span class="mono">prompts</span> table at call time —
            never hardcoded. Admins change it under Prompt engine.</p>
        </div>
      </div>
    </div>`;

  workspaceShell(article, 'qa', body);

  $('#run-qa').onclick = async () => {
    // API: POST /api/articles/:id/qa
    const btn = $('#run-qa'); btn.disabled = true;
    $('#qa-progress').hidden = false;
    const steps = [
      ['Embedding article context…', 22],
      ['Querying Vectorize for top 5 lessons…', 45],
      ['Assembling QA prompt (prompt + style + lessons)…', 62],
      ['Calling Gemini…', 88],
      ['Storing QA output as the review draft…', 100]
    ];
    for (const [label, pct] of steps) {
      $('#qa-step').textContent = label;
      $('#qa-bar').style.width = pct + '%';
      await wait(700);
    }
    article.status = 'review';
    toast('QA complete. The reviewer draft is ready.');
    location.hash = `#/a/${article.id}/review`;
  };
}

/* --- Stage 4: side-by-side reviewer editor ------------------------------- */
const AMHARIC_DRAFT = () => (DB.chunks.art_9fa21c || [])
  .map(c => c.amharic_text || SAMPLE_AMHARIC[c.ord] || '')
  .filter(Boolean).join('\n\n');

function stageReview(article) {
  const chunks = DB.chunks[article.id] || [];
  const bufKey = `te-draft-${article.id}`;
  let buffered = null;
  try { buffered = JSON.parse(localStorage.getItem(bufKey) || 'null'); } catch {}

  crumbs([{ label: 'Articles', go: '/articles' }, { label: article.title, go: `/a/${article.id}/qa` }, { label: 'Review' }]);

  VIEW.innerHTML = `
    <div class="editor-wrap">
      <div class="editor-bar">
        <button class="btn btn-sm btn-ghost" data-route="articles">${icon('back')}</button>
        <div style="min-width:0">
          <div class="small" style="font-weight:600;letter-spacing:-.01em">${esc(article.title)}</div>
          <div class="row muted" style="font-size:11px;gap:6px">
            <span class="mono">${article.id}</span>·<span>QA’d with ${esc(styleName(article.writer_style_id))}</span>
          </div>
        </div>
        <div class="actions">
          <span class="save-state saved" id="save-state"><span class="dot"></span><span id="save-text">All changes saved</span></span>
          <label class="switch" title="Simulate losing the connection">
            <input type="checkbox" id="offline" /><span class="track"></span>
            <span class="small muted">Offline</span>
          </label>
          <div class="seg" id="align-seg">
            <button data-a="on" aria-pressed="true">Aligned</button>
            <button data-a="off" aria-pressed="false">Free</button>
          </div>
          <button class="btn btn-sm" id="save-now">${icon('save')} Save now <kbd style="margin-left:4px">⌘S</kbd></button>
          <button class="btn btn-sm btn-primary" id="finalize">${icon('check')} Finalize</button>
        </div>
      </div>

      <div id="restore-slot"></div>

      <div class="panes">
        <div class="pane">
          <div class="pane-head">English source
            <span class="actions small muted">read-only · ${chunks.length} chunks</span></div>
          <div class="pane-body ro" id="pane-en">
            ${chunks.map((c, i) => `
              <div class="seg-mark" data-seg="${i}" style="margin-bottom:18px">
                <div class="muted" style="font-size:10.5px;font-weight:600;letter-spacing:.05em;margin-bottom:5px">CHUNK ${c.ord}</div>
                <p>${esc(c.english_text)}</p>
              </div>`).join('')}
          </div>
        </div>
        <div class="pane">
          <div class="pane-head">Amharic — editable
            <span class="actions small muted" id="am-count"></span></div>
          <div class="pane-body">
            <textarea class="amharic-input" id="am" spellcheck="false"></textarea>
          </div>
        </div>
      </div>
    </div>`;

  const am = $('#am');
  const qaOutput = AMHARIC_DRAFT();
  am.value = buffered?.text ?? qaOutput;

  /* Restore banner — requirement: the reviewer must trust what they're seeing */
  if (buffered?.text && buffered.text !== qaOutput) {
    $('#restore-slot').innerHTML = `
      <div class="banner banner-info" style="border-radius:0;border-left:0;border-right:0;border-top:0">
        ${icon('info')}
        <span>Restored your latest edits from <b>${ago(buffered.at)}</b> — they were buffered in this browser and
          are newer than the last saved draft.</span>
        <span class="actions">
          <button class="btn btn-sm" id="use-qa">Discard, use QA output</button>
          <button class="btn btn-sm btn-ghost" id="dismiss-restore">Keep my edits</button>
        </span>
      </div>`;
    $('#use-qa').onclick = () => {
      am.value = qaOutput; try { localStorage.removeItem(bufKey); } catch {}
      $('#restore-slot').innerHTML = ''; setState('saved'); count();
    };
    $('#dismiss-restore').onclick = () => { $('#restore-slot').innerHTML = ''; };
  }

  /* --- autosave state machine ------------------------------------------- */
  let timer = null, dirty = false, lastSaved = am.value;
  const stateEl = $('#save-state'), textEl = $('#save-text');
  const setState = (s, msg) => {
    stateEl.className = `save-state ${s}`;
    textEl.textContent = msg || {
      saved: 'All changes saved', dirty: 'Unsaved — buffered locally',
      saving: 'Saving…', offline: 'Offline — edits buffered locally'
    }[s];
  };

  const buffer = () => {
    // Never lose reviewer work: local buffer survives crash, reload and offline.
    try { localStorage.setItem(bufKey, JSON.stringify({ text: am.value, at: Date.now() })); } catch {}
  };

  async function save(manual) {
    if ($('#offline').checked) { setState('offline'); if (manual) toast('Still offline — your edits are safe in the local buffer.', 'err'); return; }
    if (am.value === lastSaved) { setState('saved'); return; }
    setState('saving');
    // API: PATCH /api/articles/:id/draft
    await wait(520);
    lastSaved = am.value; dirty = false;
    setState('saved', `Saved ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`);
    try { localStorage.removeItem(bufKey); } catch {}
    if (manual) toast('Draft saved to D1.');
  }
  window.__forceSave = () => save(true);

  const count = () => {
    $('#am-count').textContent = `${am.value.length.toLocaleString()} characters`;
  };

  am.addEventListener('input', () => {
    dirty = true; buffer(); count();
    setState($('#offline').checked ? 'offline' : 'dirty');
    clearTimeout(timer);
    // Debounced. The real app uses a minutes-order interval to respect the D1
    // free-tier write budget; shortened here so the prototype is demonstrable.
    timer = setTimeout(() => save(false), 6000);
  });

  $('#offline').onchange = e => {
    if (e.target.checked) { setState('offline'); toast('Connection lost. Edits keep buffering locally.', 'err'); }
    else { toast('Back online — flushing buffered edits.', 'info'); save(false); }
  };
  $('#save-now').onclick = () => save(true);
  count(); setState(dirty ? 'dirty' : 'saved');

  /* --- scroll-sync alignment -------------------------------------------- */
  let aligned = true;
  $$('#align-seg button').forEach(b => b.onclick = () => {
    aligned = b.dataset.a === 'on';
    $$('#align-seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (!aligned) $$('.seg-mark').forEach(s => s.classList.remove('linked'));
  });
  const en = $('#pane-en');
  am.parentElement.addEventListener('scroll', e => {
    if (!aligned) return;
    const r = e.target.scrollTop / Math.max(1, e.target.scrollHeight - e.target.clientHeight);
    en.scrollTop = r * (en.scrollHeight - en.clientHeight);
    const i = Math.min(chunks.length - 1, Math.round(r * (chunks.length - 1)));
    $$('.seg-mark').forEach((s, j) => s.classList.toggle('linked', j === i));
  }, { passive: true });

  /* --- finalize ---------------------------------------------------------- */
  $('#finalize').onclick = () => confirmDialog({
    title: 'Finalize this article?',
    body: `This stores your Amharic as the human-final version and asks Gemini to compare it against the QA
      output. The resulting change summary and fix count are written to the correction library and embedded,
      so future QA passes can retrieve them. <b>The comparison is AI-based, not a character diff</b> — a text
      diff is unreliable on Ge’ez.`,
    confirm: 'Finalize & capture corrections',
    onConfirm: async () => {
      await save(true);
      article.status = 'final';
      article.fix_count = DB.compare.fix_count;
      toast('Finalized. Running compare…', 'info');
      location.hash = `#/a/${article.id}/final`;
    }
  });
}

/* --- Stage 5: finalized + compare result --------------------------------- */
function stageFinal(article) {
  const c = DB.compare;
  const body = `
    <div class="banner banner-ok" style="margin-bottom:16px">
      ${icon('check')}
      <span><b>Finalized.</b> The comparison ran, a correction row was written to D1, and its summary was
        embedded into Vectorize as <span class="mono">vec_${article.id.slice(4)}</span>.</span>
    </div>

    <div class="grid" style="grid-template-columns:1fr 320px;align-items:start">
      <div class="stack">
        <div class="card">
          <div class="card-head">
            <h3>What the human changed</h3>
            <div class="actions"><span class="small muted">Gemini comparison · QA output vs. human final</span></div>
          </div>
          <div class="card-pad">
            <div class="stack-sm">
              ${c.changes.map(ch => `
                <div class="lesson">
                  <div class="lesson-score" style="width:auto;min-width:74px">
                    <span class="tag" style="color:var(--text-dim)">${esc(ch.kind)}</span>
                  </div>
                  <div class="lesson-text">${esc(ch.text)}</div>
                </div>`).join('')}
            </div>
            <div class="divider"></div>
            <div class="stat-label">What to check next time</div>
            <p class="small dim" style="margin-top:5px;line-height:1.6">${esc(c.next_time)}</p>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Published Amharic</h3>
            <div class="actions"><button class="btn btn-sm" id="copy">Copy</button></div></div>
          <div class="card-pad geez" style="font-size:15.5px;max-height:340px;overflow:auto" id="final-text">${esc(AMHARIC_DRAFT())}</div>
        </div>
      </div>

      <div class="stack">
        <div class="card stat">
          <div class="stat-label">Fixes this article</div>
          <div class="stat-value">${c.fix_count}</div>
          <div class="stat-foot"><span class="trend-down">↓ ${DB.finalized.at(-1).fix_count - c.fix_count}</span> vs. previous finalized</div>
        </div>
        <div class="card card-pad">
          <div class="stat-label" style="margin-bottom:9px">Stored to the library</div>
          <div class="stack-sm small dim">
            <div class="row"><span>D1 <span class="mono">corrections</span> row</span><span class="spacer"></span>${icon('check')}</div>
            <div class="row"><span>Workers AI embedding</span><span class="spacer"></span>${icon('check')}</div>
            <div class="row"><span>Vectorize upsert</span><span class="spacer"></span>${icon('check')}</div>
            <div class="row"><span>Topic tag</span><span class="spacer"></span><span class="tag">${esc(c.topic_tag)}</span></div>
          </div>
          <p class="hint" style="margin-top:11px">The row and the vector are written together. If either fails the
            correction is marked pending rather than left orphaned on one side.</p>
        </div>
        <button class="btn" data-route="metrics" style="width:100%">${icon('chart')} See the fixes trend</button>
      </div>
    </div>`;

  workspaceShell(article, 'final', body);
  $('#copy').onclick = () => {
    navigator.clipboard?.writeText($('#final-text').textContent).then(
      () => toast('Amharic copied to clipboard.'),
      () => toast('Copy blocked by the browser.', 'err'));
  };
}

/* =============================================================================
   View — Fixes-per-article trend
   ============================================================================= */
ROUTES.metrics = () => {
  crumbs([{ label: 'Fixes trend' }]);
  const pts = DB.finalized.map(a => ({ x: a.updated_at, y: a.fix_count, a }));
  const baselineCount = 3;

  VIEW.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Fixes per article</h1>
          <p class="page-sub">The product’s core health signal: how many fixes a human still has to make after QA.
            If retrieval is working, this line trends down as the correction library grows.</p>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat">
          <div class="stat-label">Baseline · first ${baselineCount}</div>
          <div class="stat-value">${avgFixes(baselineCount, true)}</div>
          <div class="stat-foot">avg fixes per article</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Latest ${baselineCount}</div>
          <div class="stat-value">${avgFixes(baselineCount)}</div>
          <div class="stat-foot"><span class="trend-down">↓ ${Math.round((1 - avgFixes(3) / avgFixes(3, true)) * 100)}%</span> vs. baseline</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Library size</div>
          <div class="stat-value">${DB.corrections_total}</div>
          <div class="stat-foot">${DB.corrections_seeded} seeds + ${DB.corrections_total - DB.corrections_seeded} finalized</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Articles finalized</div>
          <div class="stat-value">${pts.length}</div>
          <div class="stat-foot">over ${Math.round((pts.at(-1).x - pts[0].x) / 86400000)} days</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Fixes per finalized article, in time order</h3>
          <div class="actions"><span class="small muted">GET /api/metrics/fixes</span></div>
        </div>
        <div class="card-pad">
          ${lineChart(pts, baselineCount)}
          <div class="legend">
            <span><i style="background:var(--accent)"></i> fixes per article</span>
            <span><i style="background:var(--ok)"></i> trend</span>
            <span><i style="background:color-mix(in srgb, var(--warn) 40%, transparent)"></i> baseline period (first ${baselineCount})</span>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">Finalized articles</span></div>
        <div class="card">
          <table class="table">
            <thead><tr><th>Article</th><th>Style</th><th class="num">Fixes</th><th class="num">Finalized</th></tr></thead>
            <tbody>
              ${[...pts].reverse().map(p => `
                <tr data-id="${p.a.id}">
                  <td><div class="t-title">${esc(p.a.title)}</div><div class="t-meta mono">${p.a.id}</div></td>
                  <td class="small dim">${esc(styleName(p.a.writer_style_id))}</td>
                  <td class="num" style="font-variant-numeric:tabular-nums;font-weight:560">${p.y}</td>
                  <td class="num small dim nowrap">${shortDate(p.x)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  $$('tbody tr[data-id]').forEach(tr => tr.onclick = () => location.hash = `#/a/${tr.dataset.id}/final`);
};

function lineChart(pts, baselineCount) {
  const W = 880, H = 240, P = { t: 16, r: 16, b: 26, l: 34 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const maxY = Math.ceil(Math.max(...pts.map(p => p.y)) / 5) * 5;
  const X = i => P.l + (pts.length === 1 ? iw / 2 : (i / (pts.length - 1)) * iw);
  const Y = v => P.t + ih - (v / maxY) * ih;

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
  const area = `${line} L${X(pts.length - 1).toFixed(1)} ${P.t + ih} L${X(0).toFixed(1)} ${P.t + ih} Z`;

  // least-squares trend
  const n = pts.length;
  const sx = pts.reduce((s, _, i) => s + i, 0), sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p, i) => s + i * p.y, 0), sxx = pts.reduce((s, _, i) => s + i * i, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), inter = (sy - slope * sx) / n;

  const ticks = [0, maxY / 4, maxY / 2, (maxY * 3) / 4, maxY];
  return `
  <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
       aria-label="Fixes per article over time, trending down">
    <defs>
      <linearGradient id="fadeAccent" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity=".16"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect class="baseline-band" x="${P.l}" y="${P.t}" width="${X(baselineCount - 1) - P.l + 14}" height="${ih}"/>
    <text class="baseline-text" x="${P.l + 7}" y="${P.t + ih - 8}">baseline period</text>
    ${ticks.map(t => `
      <line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/>
      <text class="axis-text" x="${P.l - 8}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end">${t}</text>`).join('')}
    <path class="area" d="${area}"/>
    <path class="series" d="${line}"/>
    <path class="trendline" d="M${X(0)} ${Y(inter).toFixed(1)} L${X(n - 1)} ${Y(Math.max(0, inter + slope * (n - 1))).toFixed(1)}"/>
    ${pts.map((p, i) => `
      <circle class="pt" cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.6">
        <title>${esc(p.a.title)} — ${p.y} fixes, ${shortDate(p.x)}</title>
      </circle>`).join('')}
    ${pts.map((p, i) => i % 2 === 0
      ? `<text class="axis-text" x="${X(i).toFixed(1)}" y="${H - 7}" text-anchor="middle">${shortDate(p.x)}</text>`
      : '').join('')}
  </svg>`;
}

/* =============================================================================
   View — Writer style profiles (admin)
   ============================================================================= */
ROUTES.styles = (id) => {
  if (id) return styleDetail(id);
  crumbs([{ label: 'Writer styles' }]);
  VIEW.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Writer styles <span class="admin-note">${icon('lock')} admin only</span></h1>
          <p class="page-sub">Paste a writer’s published articles and Gemini derives reusable tone guidelines —
            register, sentence rhythm, vocabulary, attribution. Approved profiles become selectable at QA time.</p>
        </div>
        <div class="actions"><button class="btn btn-primary" id="new-style">${icon('plus')} Derive a profile</button></div>
      </div>

      <div class="grid grid-3">
        ${DB.styles.map(s => `
          <div class="card" data-style="${s.id}" style="cursor:pointer">
            <div class="card-head">
              <h3>${esc(s.writer_name)}</h3>
              <div class="actions">${s.approved
                ? '<span class="pill pill-ok">Approved</span>'
                : '<span class="pill pill-warn">Needs review</span>'}</div>
            </div>
            <div class="card-pad">
              <p class="small dim" style="line-height:1.55;height:66px;overflow:hidden">
                ${esc(s.derived_guidelines.split('\n')[0].replace(/^Register:\s*/, ''))}</p>
              <div class="divider" style="margin:10px 0"></div>
              <div class="row small muted">
                <span>${s.samples} sample${s.samples === 1 ? '' : 's'}</span>
                <span class="spacer"></span><span>${ago(s.created_at)}</span>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  $$('[data-style]').forEach(c => c.onclick = () => location.hash = `#/styles/${c.dataset.style}`);
  $('#new-style').onclick = () => openOverlay(`
    <div class="modal-head">
      <div class="modal-title">Derive a style profile</div>
      <div class="modal-sub">Paste one or more published articles by the writer. Gemini extracts concrete,
        reusable guidelines — not a summary of what the articles are about.</div>
    </div>
    <div class="modal-body stack">
      <div class="field"><label class="label">Writer name</label>
        <input class="input" placeholder="e.g. Selam T." /></div>
      <div class="field"><label class="label">Sample article 1</label>
        <textarea class="textarea" placeholder="Paste a full published article…"></textarea></div>
      <button class="btn btn-sm btn-ghost" style="align-self:flex-start">${icon('plus')} Add another sample</button>
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="derive">Derive guidelines</button>
    </div>`, {
    wide: true,
    onMount: ov => $('#derive', ov).onclick = () => {
      closeOverlay(); toast('Guidelines derived. Review and approve before QA can use them.', 'info');
      location.hash = '#/styles/sty_3';
    }
  });
};

function styleDetail(id) {
  const s = DB.styles.find(x => x.id === id) || DB.styles[0];
  crumbs([{ label: 'Writer styles', go: '/styles' }, { label: s.writer_name }]);
  VIEW.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">${esc(s.writer_name)}</h1>
          <p class="page-sub">${s.approved
            ? 'Approved — selectable on new articles and injected into the QA prompt.'
            : 'Not yet approved. Run the A/B check below to confirm the guidelines actually shift the tone before approving.'}</p>
        </div>
        <div class="actions">
          ${s.approved
            ? `<button class="btn" id="unapprove">Withdraw approval</button>`
            : `<button class="btn btn-primary" id="approve">${icon('check')} Approve profile</button>`}
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 380px;align-items:start">
        <div class="card">
          <div class="card-head"><h3>Derived guidelines</h3>
            <div class="actions"><button class="btn btn-sm btn-ghost" id="edit-g">Edit</button></div></div>
          <div class="card-pad small dim" style="line-height:1.7;white-space:pre-wrap">${esc(s.derived_guidelines)}</div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Tone check</h3></div>
          <div class="card-pad stack">
            <p class="hint">Run a short test text through QA with and without the profile. If the two outputs read
              the same, the guidelines aren’t specific enough to be worth approving.</p>
            <textarea class="textarea" id="test-text" style="min-height:90px"
              placeholder="Paste a short English paragraph…">The authority said exports rose sharply, and officials attributed the gain to tighter border controls.</textarea>
            <button class="btn btn-primary" id="run-ab" style="width:100%">${icon('play')} Run A/B</button>
            <div id="ab-out"></div>
          </div>
        </div>
      </div>
    </div>`;

  $('#edit-g')?.addEventListener('click', () => toast('Guidelines are editable before approval.', 'info'));
  $('#approve')?.addEventListener('click', () => confirmDialog({
    title: `Approve ${esc(s.writer_name)}?`,
    body: 'Approved profiles appear in the style selector on new articles and their guidelines are injected into every QA pass that selects them.',
    confirm: 'Approve',
    onConfirm: () => { s.approved = 1; toast('Profile approved.'); route(); }
  }));
  $('#unapprove')?.addEventListener('click', () => { s.approved = 0; toast('Approval withdrawn.', 'info'); route(); });

  $('#run-ab').onclick = async () => {
    const btn = $('#run-ab'); btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Running both…`;
    await wait(1200);
    btn.disabled = false; btn.innerHTML = `${icon('retry')} Run A/B again`;
    $('#ab-out').innerHTML = `
      <div class="divider"></div>
      <div class="stat-label">Without profile</div>
      <p class="geez small" style="margin-top:5px">ባለሥልጣኑ ወጪ ንግድ በከፍተኛ ሁኔታ መጨመሩን ገልጿል፤ ባለሥልጣናትም ለዕድገቱ ምክንያት ያሉት ጥብቅ የድንበር ቁጥጥር ነው።</p>
      <div class="stat-label" style="margin-top:12px">With ${esc(s.writer_name)}</div>
      <p class="geez small" style="margin-top:5px">ባለሥልጣኑ እንዳስታወቀው የወጪ ንግዱ በእጅጉ አድጓል። ለዚህ ዕድገት ምክንያት የሆነው በድንበር ላይ የተጣለው ጥብቅ ቁጥጥር ነው።</p>
      <p class="hint" style="margin-top:10px">Attribution moved to the front and the long sentence was broken in two —
        both are in the profile.</p>`;
  };
}

/* =============================================================================
   View — Prompt engine (admin)
   ============================================================================= */
ROUTES.prompts = (key = 'qa') => {
  const p = DB.prompts[key] || DB.prompts.qa;
  const current = p.versions.find(v => v.v === p.current);
  crumbs([{ label: 'Prompt engine', go: '/prompts' }, { label: p.label }]);

  VIEW.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Prompt engine <span class="admin-note">${icon('lock')} admin only</span></h1>
          <p class="page-sub">Split, translate and QA all read their prompt from the database at call time.
            Publishing writes a new immutable version — nothing is ever overwritten, and rollback only repoints
            which version is current.</p>
        </div>
      </div>

      <div class="seg" id="pkey" style="margin-bottom:16px">
        ${Object.values(DB.prompts).map(x => `
          <button data-k="${x.key}" aria-pressed="${x.key === p.key}">
            ${x.label} <span class="muted" style="margin-left:5px">v${x.current}</span>
          </button>`).join('')}
      </div>

      <div class="grid" style="grid-template-columns:1fr 400px;align-items:start">
        <div class="card">
          <div class="card-head">
            <h3>${p.label} prompt</h3>
            <div class="actions">
              <span class="tag">currently v${p.current}</span>
              <span class="save-state" id="edit-state"><span class="dot"></span>unchanged</span>
              <button class="btn btn-sm btn-primary" id="publish" disabled>Publish new version</button>
            </div>
          </div>
          <div class="card-pad stack">
            <p class="hint">${esc(p.description)}</p>
            <textarea class="textarea mono" id="body" style="min-height:300px;line-height:1.65">${esc(current.body)}</textarea>
            ${key === 'qa' ? `<p class="hint">
              <span class="mono">{{RETRIEVED_LESSONS}}</span> and <span class="mono">{{STYLE_GUIDELINES}}</span>
              are substituted at call time. Their order matters — lessons placed after the guidelines were
              being ignored (see v5 → v6).</p>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>${icon('history')} Version history</h3>
            <div class="actions"><span class="small muted">${p.versions.length} versions</span></div></div>
          <div class="card-pad">
            <div class="timeline">
              ${p.versions.map(v => `
                <div class="tl-item ${v.v === p.current ? 'current' : ''}">
                  <div class="tl-head">
                    <span class="tl-v">v${v.v}</span>
                    ${v.v === p.current ? '<span class="pill pill-accent">current</span>' : ''}
                    <span class="tl-meta">${shortDate(v.created_at)} · ${esc(v.author.split('@')[0])}</span>
                    <div class="actions">
                      <button class="btn btn-sm btn-ghost" data-diff="${v.v}">View</button>
                      ${v.v === p.current ? ''
                        : `<button class="btn btn-sm" data-roll="${v.v}">${icon('retry')} Roll back</button>`}
                    </div>
                  </div>
                  <div class="tl-meta" style="margin-top:4px">${esc(v.note)}</div>
                </div>`).join('')}
            </div>
            <p class="hint" style="margin-top:12px">Rollback updates
              <span class="mono">prompts.current_version_id</span> only. Every version stays on disk forever.</p>
          </div>
        </div>
      </div>
    </div>`;

  $$('#pkey button').forEach(b => b.onclick = () => location.hash = `#/prompts/${b.dataset.k}`);

  const ta = $('#body'), pub = $('#publish'), st = $('#edit-state');
  ta.oninput = () => {
    const changed = ta.value !== current.body;
    pub.disabled = !changed;
    st.className = `save-state ${changed ? 'dirty' : ''}`;
    st.innerHTML = `<span class="dot"></span>${changed ? 'unpublished changes' : 'unchanged'}`;
  };

  pub.onclick = () => openOverlay(`
    <div class="modal-head">
      <div class="modal-title">Publish v${p.current + 1} of the ${p.label.toLowerCase()} prompt</div>
      <div class="modal-sub">This inserts a new <span class="mono">promptVersions</span> row and repoints
        <span class="mono">current_version_id</span>. v${p.current} stays exactly as it is and can be rolled back to.</div>
    </div>
    <div class="modal-body">
      <div class="field">
        <label class="label">What changed, and why</label>
        <input class="input" id="note" placeholder="e.g. moved lessons above style guidelines" />
        <span class="hint">Shown in the history list. Future-you will want this.</span>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="go">Publish v${p.current + 1}</button>
    </div>`, {
    onMount: ov => $('#go', ov).onclick = () => {
      // API: PUT /api/prompts/:key
      const note = $('#note', ov).value.trim() || 'No note.';
      p.versions.unshift({ v: p.current + 1, author: DB.user.email, created_at: Date.now(), note, body: ta.value });
      p.current += 1;
      closeOverlay();
      toast(`Published v${p.current}. It takes effect on the next ${p.label.toLowerCase()} call.`);
      route();
    }
  });

  $$('[data-roll]').forEach(b => b.onclick = () => {
    const v = +b.dataset.roll;
    confirmDialog({
      title: `Roll back to v${v}?`,
      body: `v${p.current} is <b>not</b> deleted — rollback only points <span class="mono">current_version_id</span>
        at v${v}. You can roll forward again at any time.`,
      confirm: `Make v${v} current`,
      onConfirm: () => { // API: POST /api/prompts/:key/rollback
        p.current = v; toast(`v${v} is now the current ${p.label.toLowerCase()} prompt.`); route();
      }
    });
  });

  $$('[data-diff]').forEach(b => b.onclick = () => {
    const v = p.versions.find(x => x.v === +b.dataset.diff);
    openOverlay(`
      <div class="modal-head">
        <div class="modal-title">${p.label} prompt · v${v.v}</div>
        <div class="modal-sub">${esc(v.note)} — ${esc(v.author)}, ${shortDate(v.created_at)}</div>
      </div>
      <div class="modal-body"><div class="tl-body" style="max-height:none">${esc(v.body)}</div></div>
      <div class="modal-foot"><button class="btn" data-close>Close</button></div>`, { wide: true });
  });
};

/* =============================================================================
   View — Seed intake (admin)
   ============================================================================= */
ROUTES.seeds = () => {
  crumbs([{ label: 'Seed intake' }]);
  let stored = DB.corrections_seeded;

  VIEW.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1 class="page-title">Seed intake <span class="admin-note">${icon('lock')} admin only</span></h1>
          <p class="page-sub">Bootstrap the correction library with past work. Each triple runs the same
            compare → summarise → embed path a live finalize does, so retrieval can be tested on real data
            before it matters.</p>
        </div>
      </div>

      <div class="grid grid-3" style="margin-bottom:18px">
        <div class="card stat">
          <div class="stat-label">Seeds stored</div>
          <div class="stat-value" id="seed-count">${stored}</div>
          <div class="stat-foot" id="seed-foot">target 50 · <span class="trend-down">met</span></div>
        </div>
        <div class="card stat">
          <div class="stat-label">From finalized articles</div>
          <div class="stat-value">${DB.corrections_total - DB.corrections_seeded}</div>
          <div class="stat-foot">captured automatically at finalize</div>
        </div>
        <div class="card stat">
          <div class="stat-label">Vectors in index</div>
          <div class="stat-value">${DB.corrections_total}</div>
          <div class="stat-foot">1 per correction · no orphans</div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1fr 300px;align-items:start">
        <div class="card">
          <div class="card-head">
            <h3>Add a triple</h3>
            <div class="actions">
              <div class="seg" id="mode">
                <button data-m="one" aria-pressed="true">One at a time</button>
                <button data-m="batch" aria-pressed="false">Batch paste</button>
              </div>
            </div>
          </div>
          <div class="card-pad stack" id="seed-form">
            <div class="field"><label class="label">English source</label>
              <textarea class="textarea" style="min-height:96px" placeholder="The original English article…"></textarea></div>
            <div class="field"><label class="label">AI translation <span class="muted">(what the machine produced)</span></label>
              <textarea class="textarea geez" style="min-height:96px" placeholder="የማሽን ትርጉም…"></textarea></div>
            <div class="field"><label class="label">Human final <span class="muted">(what was published)</span></label>
              <textarea class="textarea geez" style="min-height:96px" placeholder="የታተመው የመጨረሻ ጽሑፍ…"></textarea></div>
            <div class="row">
              <span class="hint">Runs <span class="mono">POST /api/seed</span> — compare, store, embed.</span>
              <span class="spacer"></span>
              <button class="btn btn-primary" id="submit-seed">${icon('plus')} Store &amp; embed</button>
            </div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="stat-label" style="margin-bottom:9px">Why 50+</div>
          <p class="small dim" style="line-height:1.6">Retrieval quality is the whole learning promise. With a
            near-empty index, the top-N lessons injected into QA are whatever exists rather than what’s relevant —
            so the loop can look like it works while doing nothing.</p>
          <div class="divider"></div>
          <div class="stat-label" style="margin-bottom:7px">Consistency</div>
          <p class="small dim" style="line-height:1.6">A seed writes a D1 row and a Vectorize vector together.
            If the embed fails, the row is marked pending and retried — never left as an orphan.</p>
        </div>
      </div>
    </div>`;

  $$('#mode button').forEach(b => b.onclick = () => {
    $$('#mode button').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (b.dataset.m === 'batch') {
      $('#seed-form').innerHTML = `
        <div class="field"><label class="label">Batch input</label>
          <textarea class="textarea mono" style="min-height:260px"
            placeholder='[\n  { "english": "…", "ai": "…", "final": "…" },\n  { "english": "…", "ai": "…", "final": "…" }\n]'></textarea>
          <span class="hint">JSON array of triples. Submitted sequentially so one bad row doesn’t abort the batch.</span></div>
        <div class="row"><span class="spacer"></span>
          <button class="btn btn-primary" id="submit-seed">${icon('plus')} Store batch</button></div>`;
      bindSubmit();
    } else { route(); }
  });

  function bindSubmit() {
    $('#submit-seed').onclick = async () => {
      const b = $('#submit-seed'); b.disabled = true; b.innerHTML = `<span class="spin"></span> Comparing…`;
      await wait(1100);
      stored += 1; DB.corrections_seeded += 1; DB.corrections_total += 1;
      $('#seed-count').textContent = stored;
      b.disabled = false; b.innerHTML = `${icon('plus')} Store &amp; embed`;
      toast('Correction stored and embedded. Library is now ' + DB.corrections_total + '.');
      renderNav();
    };
  }
  bindSubmit();
};

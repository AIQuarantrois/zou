// Jetons et styles de base du backoffice. Les valeurs ci-dessous sont une copie exacte de celles définies
// dans src/artifact.html (:root, :root[data-theme="dark"]) : le backoffice est une extension de la même
// identité, pas une interface à part avec sa propre palette approximative. Pas de bascule de thème ici (pas
// d'utilité pour un outil interne) : le mode sombre suit la préférence système, comme app/not-found.tsx et
// public/offline.html. Si les jetons de src/artifact.html changent, reporter le changement ici à la main —
// les deux systèmes de fabrication (empaquetage esbuild de la PWA, build Next.js du backoffice) sont
// indépendants, partager un fichier CSS entre les deux coûterait plus en fragilité qu'en confort.
export const ADMIN_CSS = `
@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("/assets/fonts/inter-4-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Bricolage"; font-style: normal; font-weight: 400 800; font-display: swap; src: url("/assets/fonts/bricolage-latin.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }

:root {
  color-scheme: light;
  --bg: #FFFFFF; --wash: #F3F4F6; --surface: #FFFFFF;
  --ink: #111827; --ink-2: #374151; --ink-3: #59616E;
  --rule: #E5E7EB; --rule-strong: #C9CED6; --control: #6B7280; --placeholder: #5F6774;
  --trust: #111827; --clarity: #0B63E8;
  --accent: #0B63E8; --accent-hover: #0A4FC4; --accent-ink: #FFFFFF; --accent-soft: #E4EEFF; --ring: rgba(11, 99, 232, 0.35);
  --danger: #B42318; --danger-strong: #912018; --danger-bg: #FDEDEB;
  --warn: #B54708; --warn-text: #93370D; --warn-bg: #FFF6E5;
  --ok: #067647; --ok-bg: #ECFDF3;
  --font-ui: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-disp: "Bricolage", "Inter", system-ui, sans-serif;
  --r: 4px; --r-lg: 6px;
  --shadow-pop: 0 1px 2px rgba(17, 24, 39, 0.06), 0 12px 32px -8px rgba(17, 24, 39, 0.2);
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #161616; --wash: #262626; --surface: #1E1E1E;
    --ink: #F3F3F3; --ink-2: #D0D0D0; --ink-3: #A8A8A8;
    --rule: #2F2F2F; --rule-strong: #484848; --control: #8C8C8C; --placeholder: #A0A0A0;
    --trust: #F3F3F3; --clarity: #4D9BFF;
    --accent: #4D9BFF; --accent-hover: #6FB0FF; --accent-ink: #0B1220; --accent-soft: #15233B; --ring: rgba(77, 155, 255, 0.45);
    --danger: #FF9A8F; --danger-strong: #FFB4AC; --danger-bg: #3A2120;
    --warn: #F5B661; --warn-text: #F8C77E; --warn-bg: #33291A;
    --ok: #5FD0A0; --ok-bg: #163428;
    --shadow-pop: 0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px -8px rgba(0, 0, 0, 0.6);
  }
}

* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100dvh; background: var(--bg); color: var(--ink); }
body { font: 15px/1.5 var(--font-ui); -webkit-tap-highlight-color: transparent; }
h1, h2, h3 { font-family: var(--font-disp); letter-spacing: -0.015em; margin: 0; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--clarity); outline-offset: 2px; border-radius: 4px; }

/* ---------- Structure ---------- */
.ad-shell { min-height: 100dvh; display: flex; flex-direction: column; }
.ad-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 24px; height: 56px; border-bottom: 1px solid var(--rule); flex: none; }
.ad-word { font-family: var(--font-disp); font-weight: 700; font-size: 16px; letter-spacing: -0.01em; display: flex; align-items: baseline; gap: 6px; }
.ad-word small { font-family: var(--font-ui); font-weight: 500; font-size: 13px; color: var(--ink-3); letter-spacing: 0; }
.ad-who { display: flex; align-items: center; gap: 14px; font-size: 13px; color: var(--ink-3); }
.ad-body { flex: 1; display: flex; min-height: 0; }
.ad-nav { flex: none; width: 216px; padding: 20px 12px; border-right: 1px solid var(--rule); display: flex; flex-direction: column; gap: 2px; }
.ad-nav a { display: flex; align-items: center; min-height: 36px; padding: 0 12px; border-radius: var(--r); color: var(--ink-2); text-decoration: none; font-weight: 500; font-size: 14px; }
@media (hover: hover) { .ad-nav a:hover { background: var(--wash); color: var(--ink); } }
.ad-nav a[aria-current="page"] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.ad-main { flex: 1; min-width: 0; overflow-y: auto; padding: 40px 32px 80px; }
.ad-main > .ad-wrap { max-width: 880px; margin: 0 auto; }
.ad-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 6px; }
.ad-main h1 { font-size: 26px; font-weight: 700; margin: 0 0 6px; }
.ad-lede { color: var(--ink-3); margin: 0 0 28px; max-width: 60ch; font-size: 15px; }
@media (max-width: 760px) {
  .ad-body { flex-direction: column; }
  .ad-nav { width: 100%; flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--rule); padding: 10px 16px; gap: 4px; }
  .ad-nav a { flex: none; white-space: nowrap; }
  .ad-main { padding: 24px 20px 60px; }
}

/* ---------- Surfaces ---------- */
.ad-card { border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.ad-card-pad { padding: 24px; }
.ad-card + .ad-card { margin-top: 16px; }
.ad-section + .ad-section { margin-top: 32px; }
.ad-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.ad-section-head h2 { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); }

/* ---------- Segmented control (filtres de statut) ---------- */
.ad-seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--wash); border-radius: calc(var(--r-lg) + 3px); }
.ad-seg button { border: 0; background: none; padding: 7px 14px; border-radius: var(--r-lg); font: inherit; font-size: 14px; font-weight: 600; color: var(--ink-3); cursor: pointer; white-space: nowrap; }
.ad-seg button[aria-selected="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(17, 24, 39, 0.08); }
@media (hover: hover) { .ad-seg button:not([aria-selected="true"]):hover { color: var(--ink); } }
.ad-seg-count { margin-left: 6px; opacity: 0.65; font-weight: 500; }

/* ---------- Table ---------- */
.ad-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ad-table th { text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-3); padding: 0 16px 10px; border-bottom: 1px solid var(--rule); }
.ad-table td { padding: 14px 16px; border-bottom: 1px solid var(--rule); vertical-align: middle; }
.ad-table tr:last-child td { border-bottom: 0; }
.ad-table tr.is-link { cursor: pointer; }
@media (hover: hover) { .ad-table tr.is-link:hover td { background: var(--wash); } }
.ad-table tr.is-link:focus-visible { outline: 2px solid var(--clarity); outline-offset: -2px; }
.ad-t-main { font-weight: 600; color: var(--ink); }
.ad-t-sub { font-size: 13px; color: var(--ink-3); margin-top: 2px; }

/* ---------- Badges ---------- */
.ad-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--wash); color: var(--ink-2); white-space: nowrap; }
.ad-badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ad-badge-warn { background: var(--warn-bg); color: var(--warn-text); }
.ad-badge-ok { background: var(--ok-bg); color: var(--ok); }
.ad-badge-danger { background: var(--danger-bg); color: var(--danger); }

/* ---------- Fields ---------- */
.ad-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ad-field label { font-size: 13px; font-weight: 600; color: var(--ink); }
.ad-field input, .ad-field textarea {
  font: inherit; font-size: 15px; min-height: 44px; padding: 0 12px; border: 1px solid var(--control);
  border-radius: var(--r); background: var(--surface); color: var(--ink); width: 100%;
}
.ad-field textarea { min-height: 96px; padding: 10px 12px; resize: vertical; line-height: 1.5; }
.ad-field input:focus-visible, .ad-field textarea:focus-visible { outline: 0; border-color: var(--clarity); box-shadow: 0 0 0 3px var(--ring); }
.ad-check { display: flex; align-items: center; gap: 10px; }
.ad-check input { width: 20px; height: 20px; accent-color: var(--accent); flex: none; }
.ad-grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; }
@media (min-width: 560px) { .ad-grid-2 { grid-template-columns: 1fr 1fr; } }

/* ---------- Buttons ---------- */
.ad-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 16px;
  border-radius: var(--r); border: 1px solid var(--accent); font: inherit; font-size: 14px; font-weight: 600; letter-spacing: -0.005em;
  background: var(--accent); color: var(--accent-ink); cursor: pointer; text-decoration: none;
  transition: background 0.12s ease, border-color 0.12s ease;
}
@media (hover: hover) { .ad-btn:hover { background: var(--accent-hover); border-color: var(--accent-hover); } }
.ad-btn[disabled] { opacity: 0.5; cursor: default; pointer-events: none; }
.ad-btn-ghost { background: var(--surface); color: var(--ink); border-color: var(--rule-strong); }
@media (hover: hover) { .ad-btn-ghost:hover { background: var(--wash); border-color: var(--control); } }
.ad-btn-danger { background: var(--surface); color: var(--danger); border-color: var(--rule-strong); }
@media (hover: hover) { .ad-btn-danger:hover { background: var(--danger-bg); border-color: var(--danger); } }
.ad-btn-sm { min-height: 32px; padding: 0 12px; font-size: 13px; }
.ad-link { background: none; border: 0; padding: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--accent); cursor: pointer; }
@media (hover: hover) { .ad-link:hover { color: var(--accent-hover); text-decoration: underline; text-underline-offset: 3px; } }
.ad-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

/* ---------- Feedback ---------- */
.ad-err { color: var(--danger); font-size: 14px; margin: 0; }
.ad-empty { padding: 48px 24px; text-align: center; color: var(--ink-3); font-size: 14px; }
.ad-skel { height: 44px; border-radius: var(--r); background: var(--wash); }

/* ---------- Toast (annoncer + annuler une action, jamais de confirm() natif) ---------- */
.ad-toast-wrap { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 90; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
.ad-toast { display: flex; align-items: center; gap: 4px 16px; max-width: calc(100vw - 32px); background: var(--ink); color: var(--bg); font-size: 14px; line-height: 1.4; padding: 10px 10px 10px 16px; border-radius: var(--r); box-shadow: var(--shadow-pop); pointer-events: auto; animation: ad-toast-in 0.18s ease; }
@keyframes ad-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.ad-toast-act { flex: none; min-height: 36px; padding: 0 10px; background: none; border: 0; border-radius: var(--r); color: inherit; font: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }

/* ---------- Login ---------- */
.ad-login-page { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.ad-login { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 20px; }
.ad-login h1 { font-size: 22px; text-align: center; }
.ad-login .ad-card-pad { display: flex; flex-direction: column; gap: 16px; }
.ad-denied { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 20px; text-align: center; }
.ad-denied .ad-wrap { max-width: 400px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
`;

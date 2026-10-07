// Jetons et styles de base du backoffice (mêmes couleurs que l'application publique, cf. src/artifact.html
// et app/not-found.tsx). Un CSS minimal, sans dépendance externe : le backoffice n'a pas besoin de la PWA,
// du mode hors-ligne ni du bundle de src/artifact.html.
export const ADMIN_CSS = `
@font-face { font-family: "Inter"; font-weight: 100 900; font-display: swap; src: url("/assets/fonts/inter-4-latin.woff2") format("woff2"); }
:root { --bg: #FFFFFF; --surface: #FFFFFF; --ink: #111827; --ink-2: #374151; --ink-3: #6B7280; --rule: #E5E7EB; --wash: #F3F4F6; --accent: #0B63E8; --on-accent: #FFFFFF; --danger: #B91C1C; }
@media (prefers-color-scheme: dark) { :root { --bg: #161616; --surface: #1E1E1E; --ink: #F3F3F3; --ink-2: #D0D0D0; --ink-3: #9A9A9A; --rule: #333333; --wash: #262626; --accent: #4D9BFF; --on-accent: #0A0A0A; --danger: #F87171; } }
html, body { margin: 0; min-height: 100dvh; background: var(--bg); color: var(--ink); }
body { font: 15px/1.5 "Inter", system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
.ad-shell { min-height: 100dvh; display: flex; flex-direction: column; }
.ad-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--rule); }
.ad-head strong { font-weight: 700; }
.ad-head .ad-who { color: var(--ink-3); font-size: 13px; }
.ad-nav { display: flex; gap: 4px; padding: 10px 20px; border-bottom: 1px solid var(--rule); flex-wrap: wrap; }
.ad-nav a { padding: 8px 12px; border-radius: 8px; color: var(--ink-2); text-decoration: none; font-weight: 600; font-size: 14px; }
.ad-nav a:hover, .ad-nav a:focus-visible { background: var(--wash); }
.ad-nav a[data-on="true"] { color: var(--accent); background: var(--wash); }
.ad-main { flex: 1; padding: 24px 20px 60px; max-width: 920px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.ad-main h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 4px; }
.ad-lede { color: var(--ink-2); margin: 0 0 24px; max-width: 60ch; }
.ad-card { border: 1px solid var(--rule); border-radius: 12px; padding: 20px; background: var(--surface); }
.ad-card + .ad-card { margin-top: 16px; }
.ad-table { width: 100%; border-collapse: collapse; }
.ad-table th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-3); padding: 8px 10px; border-bottom: 1px solid var(--rule); }
.ad-table td { padding: 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
.ad-table tr:last-child td { border-bottom: 0; }
.ad-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--wash); color: var(--ink-2); }
.ad-badge[data-on="true"] { color: var(--accent); }
.ad-field { display: flex; flex-direction: column; gap: 4px; }
.ad-field label { font-size: 13px; font-weight: 600; color: var(--ink-2); }
.ad-field input, .ad-field textarea { font: inherit; padding: 9px 11px; border: 1px solid var(--rule); border-radius: 8px; background: var(--bg); color: var(--ink); }
.ad-field input:focus-visible, .ad-field textarea:focus-visible, .ad-btn:focus-visible, .ad-nav a:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.ad-row { display: flex; gap: 12px; flex-wrap: wrap; }
.ad-row > * { flex: 1; min-width: 140px; }
.ad-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 16px; border-radius: 8px; border: 1px solid transparent; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600; cursor: pointer; }
.ad-btn[disabled] { opacity: 0.6; cursor: default; }
.ad-btn-ghost { background: transparent; border-color: var(--rule); color: var(--ink); }
.ad-btn-danger { background: transparent; border-color: var(--danger); color: var(--danger); }
.ad-err { color: var(--danger); font-size: 14px; margin: 0; }
.ad-ok { color: var(--ink-2); font-size: 14px; margin: 0; }
.ad-login { max-width: 360px; margin: 14vh auto 0; padding: 0 20px; display: flex; flex-direction: column; gap: 16px; }
.ad-login h1 { font-size: 22px; font-weight: 700; margin: 0; }
.ad-empty { color: var(--ink-3); padding: 20px 0; }
`;

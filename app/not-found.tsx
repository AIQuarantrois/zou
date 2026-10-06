// Mêmes couleurs et polices que l'application (jetons de src/artifact.html), clair et sombre.
const css = `
@font-face { font-family: "Inter"; font-weight: 100 900; font-display: swap; src: url("/assets/fonts/inter-4-latin.woff2") format("woff2"); }
@font-face { font-family: "Bricolage"; font-weight: 400 800; font-display: swap; src: url("/assets/fonts/bricolage-latin.woff2") format("woff2"); }
:root { --bg: #FFFFFF; --ink: #111827; --ink-2: #374151; --accent: #0B63E8; --on-accent: #FFFFFF; }
@media (prefers-color-scheme: dark) { :root { --bg: #161616; --ink: #F3F3F3; --ink-2: #D0D0D0; --accent: #4D9BFF; --on-accent: #0A0A0A; } }
html, body { margin: 0; min-height: 100dvh; background: var(--bg); color: var(--ink); }
body { font: 16px/1.55 "Inter", system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
.nf { max-width: 480px; margin: 0 auto; padding: calc(20vh + env(safe-area-inset-top, 0px)) 20px 40px; }
.nf h1 { font: 700 30px/1.15 "Bricolage", "Inter", sans-serif; letter-spacing: -0.02em; margin: 0 0 12px; }
.nf p { margin: 0 0 28px; color: var(--ink-2); }
.nf a { display: inline-flex; align-items: center; min-height: 48px; padding: 0 22px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-weight: 600; text-decoration: none; }
.nf a:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
`;

export default function NotFound() {
  return (
    <main className="nf">
      <style>{css}</style>
      <h1>Page introuvable</h1>
      <p>Cette adresse n'existe pas ou a changé.</p>
      <a href="/">Revenir à l'accueil</a>
    </main>
  );
}

// Finitions, phase 5 : typographie, contraste, focus clavier visible, libellés accessibles.
// Le contraste WCAG lui-même (jetons de couleur) est couvert à fond par tests/ui-affichage.mjs ;
// ici : les commandes à icône seule ont toutes un nom accessible, le focus clavier se voit partout
// (y compris sur les pages hors de la SPA : offline.html, page introuvable), les jetons de couleur
// dupliqués sur ces deux pages ne dérivent pas de ceux de l'application, la police reste la même partout.
// La page introuvable (app/not-found.tsx) est une vraie page Next.js : le serveur local léger de
// tests/server.mjs (qui ne sert que les routes /api et les fichiers statiques) ne la rend pas, il faut
// donc un vrai `next start` le temps de ce test. Prérequis en plus de ceux de tests/ui-famille.mjs :
// `npm run build` déjà fait (dossier .next présent).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const NEXT_PORT = 3998;
const NEXT_BASE = `http://localhost:${NEXT_PORT}`;
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(hash = "/#home") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + hash); await page.waitForTimeout(300);
  return { ctx, page };
}

if (!existsSync(new URL("../.next", import.meta.url))) throw new Error("dossier .next absent : lancez « npm run build » avant ce test (page introuvable servie par un vrai next start)");
// Le binaire direct (pas npx) : un seul processus à tuer en sortie, pas de sous-processus npx orphelin.
const next = spawn(new URL("../node_modules/.bin/next", import.meta.url).pathname, ["start", "-p", String(NEXT_PORT)], { cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("next start : délai dépassé")), 30000);
  const onData = (d) => { if (/Ready in|started server/i.test(String(d))) { clearTimeout(timer); resolve(); } };
  next.stdout.on("data", onData); next.stderr.on("data", onData);
  next.on("exit", (code) => { clearTimeout(timer); reject(new Error("next start : arrêt prématuré (" + code + ")")); });
});

try {
  await runChecks();
} finally {
  await browser.close();
  next.kill("SIGKILL");
}
async function runChecks() {
// ---- 1. Chaque bouton à icône seule (sans texte visible) a un nom accessible, en HTML comme généré par JS
const srcHtml = readFileSync(new URL("../src/artifact.html", import.meta.url), "utf8");
function iconOnlyWithoutLabel(html) {
  const bad = [];
  for (const m of html.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)) {
    const attrs = m[0].slice(0, m[0].indexOf(">") + 1);
    const text = m[1].replace(/<svg.*?<\/svg>/gs, "").replace(/<[^>]+>/g, "").trim();
    if (!text && !/aria-label=/.test(attrs)) bad.push(attrs.slice(0, 120));
  }
  return bad;
}
assert.deepEqual(iconOnlyWithoutLabel(srcHtml), [], "tout bouton à icône seule porte un aria-label dans le HTML source");
let { ctx, page } = await open();
await page.goto(BASE + "/#vault"); await page.waitForTimeout(300);
const liveBad = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => {
  const text = [...b.childNodes].filter((n) => n.nodeType === 3 || (n.tagName && n.tagName !== "SVG")).map((n) => n.textContent).join("").trim();
  return !text && !b.hasAttribute("aria-label");
}).map((b) => b.outerHTML.slice(0, 120)));
assert.deepEqual(liveBad, [], "idem pour les boutons construits en JS (coffre, dates, etc.)");
await ctx.close();
ok("tout bouton à icône seule porte un nom accessible (aria-label), en HTML comme généré par JS");

// ---- 2. Focus clavier visible : contour qui apparaît, partout (application, page hors ligne, page introuvable)
async function checkFocusVisible(url, selector) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await p.goto(url); await p.waitForTimeout(200);
  await p.locator(selector).first().focus();
  const outline = await p.evaluate((s) => { const el = document.querySelector(s); return getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth; }, selector);
  assert.doesNotMatch(outline, /^none/, url + " : contour de focus visible sur " + selector);
  await c.close();
}
await checkFocusVisible(BASE + "/#home", ".tab");
await checkFocusVisible(BASE + "/offline.html", "a.btn");
await checkFocusVisible(NEXT_BASE + "/adresse-inconnue", ".nf a");
ok("focus clavier visible dans l'application, sur la page hors ligne et sur la page introuvable");

// ---- 3. Les jetons de couleur dupliqués dans offline.html et la page introuvable ne dérivent pas de l'application
const offline = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");
const notFound = readFileSync(new URL("../app/not-found.tsx", import.meta.url), "utf8");
const appTokens = (name, dark) => {
  const block = dark
    ? srcHtml.slice(srcHtml.indexOf(':root[data-theme="dark"] {'), srcHtml.indexOf("}", srcHtml.indexOf(':root[data-theme="dark"] {')))
    : srcHtml.slice(srcHtml.indexOf(":root {"), srcHtml.indexOf("}", srcHtml.indexOf(":root {")));
  const m = block.match(new RegExp("--" + name + ":\\s*(#[0-9A-Fa-f]{6})"));
  return m && m[1].toUpperCase();
};
for (const [file, label] of [[offline, "offline.html"], [notFound, "app/not-found.tsx"]]) {
  for (const name of ["bg", "ink", "ink-2", "accent"]) {
    for (const dark of [false, true]) {
      const want = appTokens(name, dark);
      const re = dark
        ? new RegExp("@media \\(prefers-color-scheme: dark\\).*?--" + name + ":\\s*(#[0-9A-Fa-f]{6})", "s")
        : new RegExp(":root \\{[^}]*--" + name + ":\\s*(#[0-9A-Fa-f]{6})");
      const got = (file.match(re) || [])[1];
      assert.equal(got && got.toUpperCase(), want, `${label} : --${name} (${dark ? "sombre" : "clair"}) suit l'application (${want})`);
    }
  }
}
ok("les couleurs dupliquées dans offline.html et la page introuvable restent alignées sur celles de l'application");

// ---- 4. Même police partout : l'application, la page hors ligne, la page introuvable
({ ctx, page } = await open());
const appFont = await page.evaluate(() => getComputedStyle(document.querySelector(".h-display, h1")).fontFamily);
await ctx.close();
for (const [url, sel] of [[BASE + "/offline.html", "h1"], [NEXT_BASE + "/adresse-inconnue", ".nf h1"]]) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await p.goto(url); await p.waitForTimeout(200);
  const f = await p.evaluate((s) => getComputedStyle(document.querySelector(s)).fontFamily, sel);
  assert.equal(f, appFont, url + " : même police de titre que l'application (" + appFont + ")");
  await c.close();
}
ok("même police de titres (Bricolage) sur l'application, la page hors ligne et la page introuvable");
}

if (problems.length) { console.log("PROBLÈMES :"); for (const p of problems) console.log(p); process.exit(1); }

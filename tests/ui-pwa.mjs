// Fondations d'application installée : tout en cache dès le premier lancement, ouverture en mode avion,
// page « Hors ligne », bandeau hors ligne, theme-color clair et sombre, invitation à installer au bas d'un plan, manifeste.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";

// Vrai mode avion : l'application est servie par un relais local que l'on coupe (la coupure simulée du navigateur
// n'atteint pas toujours le service worker, qui irait alors chercher le réseau et fausserait le test).
const UP = new URL(process.env.ZOU_URL || "http://localhost:3999");
let down = false;
const relay = http.createServer((req, res) => {
  if (down) { req.socket.destroy(); return; }
  const up = http.request({ host: UP.hostname, port: UP.port, path: req.url, method: req.method, headers: { ...req.headers, host: UP.host } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on("error", () => req.socket.destroy());
  req.pipe(up);
});
await new Promise((r) => relay.listen(0, "127.0.0.1", r));
const BASE = `http://localhost:${relay.address().port}`;
async function airplane(ctx, on) { down = on; await ctx.setOffline(on); }
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
async function open(opts = {}, hash = "/#home") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_INTERNET_DISCONNECTED|Failed to load resource|ERR_CERT_AUTHORITY_INVALID/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + hash); await page.waitForTimeout(300);
  return { ctx, page };
}
const PRECACHE = JSON.parse(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8").match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);

// ---- 1. Premier lancement : toute l'application est en cache, sans seconde visite
let { ctx, page } = await open();
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(300);
const cached = await page.evaluate(async (list) => {
  const keys = await caches.keys();
  const c = await caches.open(keys.find((k) => k.startsWith("zou-")));
  const got = [];
  for (const u of list) if (await c.match(u)) got.push(u);
  return { keys, got };
}, PRECACHE);
assert.equal(cached.keys.filter((k) => k.startsWith("zou-")).length, 1, "un seul cache ZOU (les anciennes versions sont purgées)");
assert.deepEqual(cached.got, PRECACHE, "tous les fichiers de l'application sont en cache dès le premier lancement");
assert.ok(PRECACHE.some((u) => /\/assets\/app\.[0-9a-f]+\.css$/.test(u)) && PRECACHE.some((u) => u.endsWith(".woff2")), "styles, script et polices compris");
ok(`premier lancement : ${PRECACHE.length} fichiers en cache (application, styles, polices, icônes, page hors ligne)`);

// ---- 2. Mode avion : l'application s'ouvre, le bandeau le dit, il disparaît au retour du réseau
await airplane(ctx, true);
await page.reload(); await page.waitForTimeout(500);
assert.equal(await page.locator("#siteHead").isVisible(), true, "l'application s'ouvre sans réseau");
assert.equal(await page.evaluate(() => [...document.styleSheets].some((s) => s.href && /app\.[0-9a-f]+\.css/.test(s.href) && s.cssRules.length > 100)), true, "avec ses styles");
assert.equal(await page.evaluate(() => document.fonts.check('16px "Inter"')), true, "et sa police");
const bar = page.locator("#netBar");
assert.equal(await bar.isVisible(), true, "bandeau « Hors ligne »");
assert.match(await bar.innerText(), /^Hors ligne\./);
assert.equal(await bar.getAttribute("role"), "status", "annoncé aux lecteurs d'écran");
const bb = await bar.boundingBox(), hb = await page.locator("#siteHead").boundingBox();
assert.ok(bb.y >= hb.y + hb.height - 1, "sous l'en-tête, sans le recouvrir");
await page.goto(BASE + "/#vault"); await page.waitForTimeout(300);
assert.equal(await page.locator('[data-view="vault"]').isVisible(), true, "on navigue dans l'application hors ligne");
await airplane(ctx, false); await page.waitForTimeout(300);
assert.equal(await bar.isVisible(), false, "le bandeau disparaît au retour du réseau");
assert.match(await page.locator(".toast").innerText(), /Connexion rétablie/);
ok("mode avion : l'application s'ouvre avec styles et police, bandeau hors ligne, « Connexion rétablie » au retour");

// ---- 3. Page « Hors ligne » pour une adresse jamais visitée ; une page d'erreur ne remplace jamais l'application en cache
await page.goto(BASE + "/adresse-inconnue"); await page.waitForTimeout(200);
await page.goto(BASE + "/"); await page.waitForTimeout(300);
await airplane(ctx, true);
await page.goto(BASE + "/autre-page"); await page.waitForTimeout(300);
assert.match(await page.locator("h1").innerText(), /Pas de connexion/, "page de repli hors ligne");
assert.equal(await page.locator('a[href="/"]').innerText(), "Ouvrir ZOU");
await page.locator('a[href="/"]').click(); await page.waitForTimeout(500);
assert.equal(await page.locator("#siteHead").isVisible(), true, "« Ouvrir ZOU » rouvre l'application en cache (pas la page d'erreur visitée avant)");
await airplane(ctx, false);
await ctx.close();
for (const scheme of ["light", "dark"]) {
  ({ ctx, page } = await open({ colorScheme: scheme }));
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(300);
  await airplane(ctx, true);
  await page.goto(BASE + "/autre-page"); await page.waitForTimeout(300);
  const c = await page.evaluate(() => { const s = getComputedStyle(document.body), a = getComputedStyle(document.querySelector("a.btn")); return [s.backgroundColor, a.backgroundColor, document.querySelector("a.btn").getBoundingClientRect().height]; });
  assert.deepEqual(c.slice(0, 2), scheme === "dark" ? ["rgb(22, 22, 22)", "rgb(77, 155, 255)"] : ["rgb(255, 255, 255)", "rgb(11, 99, 232)"], "page hors ligne aux couleurs de ZOU en " + scheme);
  assert.ok(c[2] >= 44, "bouton de 44 px au moins");
  await airplane(ctx, false);
  await ctx.close();
}
ok("page « Hors ligne » pour une adresse non mise en cache, aux couleurs de ZOU en clair et en sombre ; l'application en cache n'est jamais écrasée par une erreur");

// ---- 4. theme-color : deux balises (clair, sombre) dans la page, alignées ensuite sur le thème choisi
const raw = await (await fetch(BASE + "/")).text();
assert.match(raw, /<meta name="theme-color" content="#FFFFFF" media="\(prefers-color-scheme: light\)">/);
assert.match(raw, /<meta name="theme-color" content="#161616" media="\(prefers-color-scheme: dark\)">/);
const tc = async (p) => p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content));
({ ctx, page } = await open({ colorScheme: "dark" }, "/#display"));
assert.deepEqual(await tc(page), ["#161616", "#161616"], "sombre : barre d'état sombre");
await page.locator("button", { hasText: "Clair" }).first().click(); await page.waitForTimeout(100);
assert.deepEqual(await tc(page), ["#FFFFFF", "#FFFFFF"], "thème clair forcé : les deux balises suivent");
await page.goto(BASE + "/#home"); await page.waitForTimeout(300);
assert.deepEqual(await tc(page), ["#1E7BFF", "#1E7BFF"], "accueil : couleur du haut du dégradé");
await ctx.close();
ok("theme-color : clair et sombre dès le premier octet, puis aligné sur le thème choisi et sur le dégradé de l'accueil");

// ---- 5. Invitation à installer au bas d'un plan (iPhone : instructions Safari), « Plus tard » mémorisé
async function plan(p) {
  await p.goto(BASE + "/#vie.visa"); await p.waitForTimeout(300);
  const pick = async (t) => { await p.locator(".vie-opt", { hasText: t }).first().click(); await p.waitForTimeout(220); };
  await pick("déjà à Madagascar"); await pick("visa de séjour d'immigrant");
  await p.fill('#vieBody input[type="date"]', new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10));
  await p.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await p.waitForTimeout(220);
  await pick("Oui"); await p.waitForTimeout(300);
}
({ ctx, page } = await open());
await plan(page);
assert.equal(await page.locator(".plan-install").isVisible(), false, "rien sur un navigateur qui ne propose pas l'installation");
await ctx.close();
({ ctx, page } = await open({ userAgent: IPHONE, isMobile: true, hasTouch: true }));
await plan(page);
const pi = page.locator(".plan-install");
assert.equal(await pi.isVisible(), true, "iPhone : invitation au bas du plan");
assert.match(await pi.innerText(), /Partager puis «\s?Sur l'écran d'accueil\s?»/);
assert.equal(await pi.locator(".btn").isVisible(), false, "pas de bouton Installer sur iPhone (installation manuelle)");
const btn = await pi.locator(".link-btn").boundingBox();
assert.ok(btn.height >= 24);
await pi.locator(".link-btn", { hasText: "Plus tard" }).click(); await page.waitForTimeout(100);
assert.equal(await pi.isVisible(), false, "« Plus tard » la referme");
await page.reload(); await page.waitForTimeout(400);
assert.equal(await page.locator(".plan-install").isVisible(), false, "et s'en souvient");
await ctx.close();
ok("invitation à installer au bas d'un plan (instructions Safari sur iPhone), refermable et mémorisée 30 jours");

// ---- 6. Manifeste et page introuvable
const mf = await (await fetch(BASE + "/manifest.webmanifest")).json();
assert.equal(mf.display, "standalone");
assert.ok(mf.icons.some((i) => i.sizes === "192x192") && mf.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
assert.equal(mf.theme_color, "#FFFFFF"); assert.equal(mf.background_color, "#FFFFFF");
assert.deepEqual(mf.launch_handler.client_mode, ["navigate-existing", "auto"], "un raccourci rouvre la fenêtre déjà ouverte");
for (const u of PRECACHE) assert.equal((await fetch(BASE + u)).status, 200, u + " existe");
ok("manifeste (standalone, 192, 512 maskable, couleurs, lancement dans la fenêtre existante) et fichiers en cache tous servis");

await browser.close();
relay.close();
if (problems.length) { console.log("PROBLÈMES :"); for (const p of problems) console.log(p); process.exit(1); }

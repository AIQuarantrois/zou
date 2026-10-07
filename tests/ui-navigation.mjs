// Navigation « application native », phase 3 : barre d'onglets persistante (3 à 5 entrées),
// en-tête compact sans menu dupliqué à aucune largeur, transitions courtes (150-250 ms, coupées
// si « moins de mouvement »), rien d'installation une fois l'application installée.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(opts = {}, hash = "/#home") {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, reducedMotion: opts.reduced ? "reduce" : "no-preference", userAgent: opts.userAgent });
  if (opts.standalone) {
    await ctx.addInitScript(() => {
      Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, addEventListener() {}, addListener() {} } : mm(q));
    });
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + hash); await page.waitForTimeout(300);
  return { ctx, page };
}
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// ---- 1. Barre d'onglets : 3 à 5 entrées, toujours présente (ne se démonte pas entre les onglets)
let { ctx, page } = await open();
const tabs = await page.locator(".tab").all();
assert.ok(tabs.length >= 3 && tabs.length <= 5, "entre 3 et 5 onglets (" + tabs.length + ")");
await page.locator('.tab[data-tab="services"]').click(); await page.waitForTimeout(300);
assert.equal(await page.locator(".tabs").isVisible(), true, "la barre reste affichée après avoir changé d'onglet");
await page.locator('.tab[data-tab="home"]').click(); await page.waitForTimeout(300);
assert.equal(await page.locator(".tabs").isVisible(), true);
await ctx.close();
ok("barre d'onglets (3 à 5 entrées) persistante d'un onglet à l'autre, jamais démontée");

// ---- 2. En-tête : jamais deux navigations à la fois (pas de menu « Services » en plus de la colonne latérale)
for (const width of [768, 1000, 1200, 1440]) {
  ({ ctx, page } = await open({ viewport: { width, height: 900 } }));
  const dup = await page.evaluate(() => {
    const nav = document.querySelector(".head-nav"), side = document.querySelector(".side");
    const vis = (e) => e && getComputedStyle(e).display !== "none";
    return { nav: vis(nav), side: vis(side) };
  });
  assert.ok(!(dup.nav && dup.side), width + "px : menu du haut et colonne latérale pas affichés ensemble");
  await ctx.close();
}
ok("aucune largeur n'affiche à la fois le menu « Services » du haut et la colonne latérale (pas de navigation dupliquée)");

// ---- 3. Transitions d'écran courtes (150-250 ms), coupées si « moins de mouvement »
const durs = await (await open()).page.evaluate(() => {
  // Un groupe conditionnel (@media, @container…) n'a pas de selectorText ; une CSSStyleRule en a un
  // (même avec des règles imbriquées, la nouvelle syntaxe CSS lui laisse aussi un .cssRules).
  const flat = (rules) => [...rules].flatMap((r) => (!("selectorText" in r) && r.cssRules ? flat(r.cssRules) : [r]));
  const all = [...document.styleSheets].flatMap((s) => { try { return flat(s.cssRules); } catch (e) { return []; } });
  const rule = all.find((x) => x.selectorText === ".nav-push");
  return rule && rule.style.animationDuration;
});
const ms = parseFloat(durs) * 1000;
assert.ok(ms >= 150 && ms <= 250, "transition d'écran : " + ms + "ms, dans 150-250ms");
({ ctx, page } = await open({ reduced: true }));
await page.locator("#lifeMore").evaluate((d) => { if (d) d.open = true; }).catch(() => {});
await page.locator(".life-b").first().click(); await page.waitForTimeout(250);
const anim = await page.evaluate(() => { const v = document.querySelector("[data-view]:not([hidden])"); return v && getComputedStyle(v).animationName; });
assert.ok(!anim || anim === "none", "« moins de mouvement » : pas d'animation de transition");
await ctx.close();
ok("transitions d'écran dans la fourchette 150-250 ms, coupées si « moins de mouvement »");

// ---- 4. Application installée (iPhone, navigator.standalone) : plus aucune invitation à installer
({ ctx, page } = await open({ userAgent: IPHONE, touch: true }));
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
const pick = async (t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(220); };
await pick("déjà à Madagascar"); await pick("visa de séjour d'immigrant");
await page.fill('#vieBody input[type="date"]', new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10));
await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(220);
await pick("Oui"); await page.waitForTimeout(300);
assert.equal(await page.locator(".plan-install").isVisible(), true, "pas encore installée : l'invitation est là");
await ctx.close();
({ ctx, page } = await open({ userAgent: IPHONE, touch: true, standalone: true }));
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
await pick("déjà à Madagascar"); await pick("visa de séjour d'immigrant");
await page.fill('#vieBody input[type="date"]', new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10));
await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(220);
await pick("Oui"); await page.waitForTimeout(300);
assert.equal(await page.locator(".plan-install").isVisible(), false, "déjà installée : plus d'invitation au bas du plan");
await page.locator('.tab[data-tab="more"]').click(); await page.waitForTimeout(250);
assert.equal(await page.locator("#installSec").isVisible(), false, "ni dans « Plus »");
await ctx.close();
ok("une fois l'application installée, plus aucune invitation à l'installer (bas de plan, « Plus »)");

// ---- 5. Geste de retour au bord gauche (comme iOS) : seuil franchi -> retour, comme le bouton de l'en-tête ;
// trop court -> l'écran revient en place ; rien sur l'accueil (pas de retour) ni sur grand écran (pas de geste).
async function edgeSwipe(page, totalDx, steps = 8, startX = 10) {
  await page.evaluate((x) => {
    const t = new Touch({ identifier: 3, target: document.body, clientX: x, clientY: 400 });
    document.dispatchEvent(new TouchEvent("touchstart", { touches: [t], bubbles: true, cancelable: true }));
  }, startX);
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((x) => {
      const t = new Touch({ identifier: 3, target: document.body, clientX: x, clientY: 400 });
      document.dispatchEvent(new TouchEvent("touchmove", { touches: [t], bubbles: true, cancelable: true }));
    }, startX + Math.round((totalDx * i) / steps));
    await page.waitForTimeout(16);
  }
  await page.evaluate(() => document.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true, cancelable: true })));
}
({ ctx, page } = await open({ touch: true, reduced: true }, "/#vie.visa"));
await edgeSwipe(page, 30);
await page.waitForTimeout(250);
assert.equal(await page.evaluate(() => location.hash), "#vie.visa", "glissement trop court : pas de retour");
assert.equal(await page.locator('[data-view="vie"]').evaluate((e) => e.style.transform), "", "l'écran revient bien à sa place (transform effacé)");
await edgeSwipe(page, 100);
await page.waitForTimeout(250);
assert.notEqual(await page.evaluate(() => location.hash), "#vie.visa", "glissement au-delà du seuil : retour déclenché, comme le bouton de l'en-tête");
await ctx.close();
({ ctx, page } = await open({ touch: true, reduced: true }, "/#home"));
await edgeSwipe(page, 150);
await page.waitForTimeout(250);
assert.equal(await page.evaluate(() => location.hash), "#home", "sur un écran racine (rien à quitter) : le geste reste sans effet");
await ctx.close();
({ ctx, page } = await open({ viewport: { width: 1280, height: 900 }, touch: true, reduced: true }, "/#vie.visa"));
await edgeSwipe(page, 150);
await page.waitForTimeout(250);
assert.equal(await page.evaluate(() => location.hash), "#vie.visa", "sur grand écran (bouton « Retour » déjà absent) : le geste reste sans effet");
await ctx.close();
ok("geste de retour au bord gauche : seuil franchi -> retour (comme l'en-tête), trop court -> en place, rien sur l'accueil ni sur grand écran");

await browser.close();
if (problems.length) { console.log("PROBLÈMES :"); for (const p of problems) console.log(p); process.exit(1); }

// CSS tactile : pas de hover persistant sur l'écran tactile, touch-action, zones de 44 px,
// champs à 16 px (pas de zoom à la saisie sur iOS), feuille « Plus » qui tient dans l'écran (dvh),
// police sans sélection sur les commandes (mais oui sur le texte des plans et des lettres).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(opts = {}, hash = "/#home") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + hash); await page.waitForTimeout(300);
  return { ctx, page };
}

// ---- 1. Pas de survol persistant sur le tactile : les styles :hover des commandes courantes
// ne s'appliquent qu'aux pointeurs capables de survol (souris)
let { ctx, page } = await open();
const noHoverOnTouch = await page.evaluate(() => {
  const probe = (sel) => { const el = document.querySelector(sel); if (!el) return null; return getComputedStyle(el).backgroundColor; };
  return window.matchMedia("(hover: hover)").matches;
});
assert.equal(noHoverOnTouch, false, "un contexte tactile ne se déclare pas « capable de survol »");
const cssText = await page.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch (e) { return []; } }).join("\n"));
assert.doesNotMatch(cssText, /\n\.q-row:hover \{/, "les règles :hover des commandes passent par @media (hover: hover)");
assert.match(cssText, /@media \(hover: hover\)\s*\{\s*\.q-row:hover/, "ex. .q-row:hover est bien dans ce bloc");
ok("styles de survol réservés aux pointeurs qui en sont capables (pas de surbrillance qui reste collée au doigt)");

// ---- 2. touch-action: manipulation sur les commandes (pas de double-tap zoom, pas de délai de 300 ms)
const ta = await page.evaluate(() => {
  const els = [".tab", ".q-row", ".life-b"].map((s) => document.querySelector(s)).filter(Boolean);
  return els.map((e) => getComputedStyle(e).touchAction);
});
assert.ok(ta.length >= 2 && ta.every((v) => v === "manipulation"), "touch-action: manipulation sur les commandes principales");
ok("touch-action: manipulation sur les commandes (pas de délai au toucher, pas de zoom au double-tap)");

// ---- 3. Zones tactiles : au moins 44 px de haut pour les commandes de la barre et des listes
await page.locator('#moreBtn').click(); await page.waitForTimeout(250);
const sizes = await page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); return e && e.getBoundingClientRect().height; };
  return { tab: r(".tab"), qrow: r("#moreSheet .q-row"), headIcon: r(".head-icon") };
});
for (const [k, v] of Object.entries(sizes)) assert.ok(v >= 44, `${k} : ${v}px ≥ 44px`);
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
ok("zones tactiles d'au moins 44 px (onglets, lignes de l'accueil, icônes de l'en-tête)");

// ---- 4. Champs à 16 px minimum (pas de zoom automatique à la saisie sur iOS)
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
await page.locator(".vie-opt", { hasText: "déjà à Madagascar" }).first().click(); await page.waitForTimeout(220);
await page.locator(".vie-opt", { hasText: "visa de séjour d'immigrant" }).first().click(); await page.waitForTimeout(220);
const dateFs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#vieBody input[type="date"]')).fontSize));
assert.ok(dateFs >= 16, "champ date : " + dateFs + "px ≥ 16px");
await page.goto(BASE + "/#home"); await page.waitForTimeout(300);
const askFs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".ask textarea")).fontSize));
assert.ok(askFs >= 16, "champ de question : " + askFs + "px ≥ 16px");
await page.goto(BASE + "/#vault"); await page.waitForTimeout(300);
const searchFs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".dt-search input")).fontSize));
assert.ok(searchFs >= 16, "champ de recherche : " + searchFs + "px ≥ 16px");
ok("champs à 16 px minimum (date, question, recherche) : pas de zoom automatique à la saisie sur iPhone");
// Le parcours visa a été entamé (deux réponses) pour mesurer le champ date : on efface avant de le refaire au complet.
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(300);

// ---- 5. Feuille « Plus » : tient dans l'écran même bas (dvh, pas vh)
await page.locator('#moreBtn').click(); await page.waitForTimeout(250);
const sheetOk = await page.evaluate(() => {
  const r = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (e) { return []; } });
  const rule = r.find((x) => x.selectorText === ".sheet-menu" && /max-height/.test(x.cssText));
  return rule && /dvh/.test(rule.cssText) && !/: *100vh|: *78vh/.test(rule.cssText);
});
assert.ok(sheetOk, "la feuille « Plus » utilise dvh, pas vh (ne déborde pas sous la barre d'adresse mobile)");
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
ok("feuille « Plus » dimensionnée en dvh (tient compte de la barre d'adresse mobile, pas seulement de la fenêtre figée)");

// ---- 6. user-select: none sur les commandes, mais le texte d'un plan reste sélectionnable
await visaDone(page);
const sel = await page.evaluate(() => {
  const tab = getComputedStyle(document.querySelector(".tab")).userSelect;
  const prose = document.querySelector(".vie-item-d, .lede, .prose");
  return { tab, prose: prose && getComputedStyle(prose).userSelect };
});
assert.equal(sel.tab, "none", "les onglets ne se sélectionnent pas au doigt");
assert.notEqual(sel.prose, "none", "le texte d'un plan reste sélectionnable et copiable");
ok("commandes non sélectionnables au doigt, texte des plans toujours sélectionnable");

async function visaDone(p) {
  await p.goto(BASE + "/#vie.visa"); await p.waitForTimeout(300);
  const pick = async (t) => { await p.locator(".vie-opt", { hasText: t }).first().click(); await p.waitForTimeout(220); };
  await pick("déjà à Madagascar"); await pick("visa de séjour d'immigrant");
  await p.fill('#vieBody input[type="date"]', new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10));
  await p.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await p.waitForTimeout(220);
  await pick("Oui"); await p.waitForTimeout(300);
}

await ctx.close();
await browser.close();
if (problems.length) { console.log("PROBLÈMES :"); for (const p of problems) console.log(p); process.exit(1); }

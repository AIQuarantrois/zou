// Composants, phase 4 : tirer pour actualiser (Dossiers, Coffre, Agenda ; seulement connecté),
// vibration sur les actions clés (étape cochée, plan terminé, tirer pour actualiser ; jamais sur iOS
// puisque navigator.vibrate n'y existe pas), rien de cassé dans les écrans vides déjà en place.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(opts = {}, hash = "/#home") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => { window.__vib = []; Object.defineProperty(window.navigator, "vibrate", { configurable: true, value: (ms) => { window.__vib.push(ms); return true; } }); });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + hash); await page.waitForTimeout(300);
  return { ctx, page };
}
async function signIn(page) {
  await page.goto(BASE + "/#account"); await page.waitForTimeout(200);
  await page.fill("#acc-email", "tirer@example.mg");
  await page.click("#acc-submit");
  await page.waitForSelector("#acc-code-box:not([hidden])");
  await page.click("#acc-submit");
  await page.waitForSelector("#accUser:not([hidden])");
}
// Glisse le doigt vers le bas depuis le haut de la page (document : le geste est posé sur document, pas sur un élément précis).
async function dragDown(page, totalDy, steps = 6) {
  await page.evaluate(() => {
    const t = (y) => new Touch({ identifier: 9, target: document.body, clientX: 60, clientY: y });
    document.dispatchEvent(new TouchEvent("touchstart", { touches: [t(80)], bubbles: true, cancelable: true }));
  });
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((y) => {
      const t = new Touch({ identifier: 9, target: document.body, clientX: 60, clientY: y });
      document.dispatchEvent(new TouchEvent("touchmove", { touches: [t], bubbles: true, cancelable: true }));
    }, 80 + Math.round((totalDy * i) / steps));
    await page.waitForTimeout(16);
  }
}
async function release(page) {
  await page.evaluate(() => document.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true, cancelable: true })));
}
// Glisse vers la gauche la ligne (Coffre, Agenda) qui porte ce bouton de suppression (identifié par son aria-label).
async function swipeLeft(page, ariaLabel, totalDx, steps = 6) {
  const body = page.locator(`.swipe-wrap:has(button[aria-label="${ariaLabel}"]) .swipe-body`);
  const box = await body.boundingBox();
  const y = box.y + box.height / 2, x0 = box.x + box.width - 10;
  await body.evaluate((el, pt) => {
    const t = new Touch({ identifier: 7, target: el, clientX: pt.x, clientY: pt.y });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [t], bubbles: true, cancelable: true }));
  }, { x: x0, y });
  for (let i = 1; i <= steps; i++) {
    await page.evaluate((pt) => {
      const t = new Touch({ identifier: 7, target: document.body, clientX: pt.x, clientY: pt.y });
      document.dispatchEvent(new TouchEvent("touchmove", { touches: [t], bubbles: true, cancelable: true }));
    }, { x: x0 - Math.round((totalDx * i) / steps), y });
    await page.waitForTimeout(16);
  }
  return body;
}

// ---- 1. Tirer pour actualiser, connecté : relâché après le seuil → actualisation, puis état remis à plat
let { ctx, page } = await open();
await signIn(page);
await page.goto(BASE + "/#cases"); await page.waitForTimeout(300);
await dragDown(page, 160);
assert.equal(await page.locator("#ptrCases").evaluate((e) => e.classList.contains("ready")), true, "seuil franchi : « relâchez pour actualiser »");
const vibAfterDrag = await page.evaluate(() => window.__vib.slice());
assert.deepEqual(vibAfterDrag, [10], "une vibration courte au franchissement du seuil");
await release(page);
await page.waitForFunction(() => document.querySelector("#ptrCases").classList.contains("load"));
ok("tirer pour actualiser : vibration au seuil, puis actualisation au relâché");
await page.waitForFunction(() => !document.querySelector("#ptrCases").classList.contains("load"), null, { timeout: 8000 });
await page.waitForTimeout(300); // laisse finir le repli en douceur (transition .snap, 220 ms)
assert.equal(await page.locator("#ptrCases").evaluate((e) => getComputedStyle(e).height), "0px", "la bande se replie une fois l'actualisation faite");
assert.match(await page.locator("#acc-sync").textContent(), /Tout est sauvegardé/, "la synchronisation a bien tourné");
ok("après actualisation, la bande se replie et le statut de synchronisation est à jour");

// ---- 2. Sous le seuil : revient en place, rien ne se déclenche
await dragDown(page, 40);
assert.equal(await page.locator("#ptrCases").evaluate((e) => e.classList.contains("ready")), false, "sous le seuil : pas prêt");
await release(page);
await page.waitForTimeout(300);
assert.equal(await page.locator("#ptrCases").evaluate((e) => e.classList.contains("load")), false, "pas d'actualisation déclenchée");
assert.equal(await page.locator("#ptrCases").evaluate((e) => getComputedStyle(e).height), "0px");
await ctx.close();
ok("un tiré trop court revient en place sans actualiser");

// ---- 3. En invité : le geste n'a pas d'effet (rien à actualiser depuis le serveur)
({ ctx, page } = await open());
await page.goto(BASE + "/#cases"); await page.waitForTimeout(300);
await dragDown(page, 160);
await page.waitForTimeout(150);
assert.equal(await page.locator("#ptrCases").evaluate((e) => parseFloat(getComputedStyle(e).height)), 0, "en invité, la bande ne bouge pas");
await release(page);
await ctx.close();
ok("en mode invité, le geste « tirer pour actualiser » reste sans effet");

// ---- 4. Vibration sur les actions clés d'un plan : étape cochée, puis toutes les étapes faites
({ ctx, page } = await open({ reduced: true }));
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
const pick = async (t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(220); };
await pick("déjà à Madagascar"); await pick("visa de séjour d'immigrant");
await page.fill('#vieBody input[type="date"]', new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10));
await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(220);
await pick("Oui"); await page.waitForTimeout(300);
const boxes = page.locator("#vieBody ol.vie-list input[type=checkbox]");
const count = await boxes.count();
await boxes.nth(0).check(); await page.waitForTimeout(60);
assert.deepEqual(await page.evaluate(() => window.__vib.slice()), [10], "une vibration à la première étape cochée");
for (let i = 1; i < count; i++) await boxes.nth(i).check();
await page.waitForTimeout(100);
const vibEnd = await page.evaluate(() => window.__vib.slice());
assert.deepEqual(vibEnd, new Array(count + 1).fill(10), "une vibration par étape, plus une à la toute dernière (plan terminé)");
await ctx.close();
ok("une vibration discrète (10 ms) à chaque étape cochée et au plan terminé");

// ---- 5. Glisser vers la gauche pour supprimer (Agenda) : seuil franchi -> rouge révélé, vibration,
// le tap sur « Supprimer » déclenche la même bannière « Annuler » que l'icône corbeille ; sous le seuil,
// la ligne revient en place ; une seule ligne ouverte à la fois.
({ ctx, page } = await open());
await page.goto(BASE + "/#agenda"); await page.waitForTimeout(200);
await page.fill("#a-title", "Toit à réparer"); await page.fill("#a-date", "2031-05-20");
await page.click('#agendaForm button[type="submit"]'); await page.waitForTimeout(250);
await page.fill("#a-title", "Impôts"); await page.fill("#a-date", "2031-06-01");
await page.click('#agendaForm button[type="submit"]'); await page.waitForTimeout(250);
// sous le seuil (48px) : revient en place, rien ne se passe
let body = await swipeLeft(page, "Supprimer Toit à réparer", 20);
assert.equal(await body.evaluate((e) => e.classList.contains("swipe-open")), false, "sous le seuil : pas encore ouverte");
await release(page); await page.waitForTimeout(300);
assert.equal(await body.evaluate((e) => getComputedStyle(e).transform), "none", "revenue en place, rien de supprimé");
ok("glissement trop court : la ligne revient en place sans rien supprimer");
// seuil franchi : rouge révélé, vibration
body = await swipeLeft(page, "Supprimer Toit à réparer", 70);
await release(page); await page.waitForTimeout(300);
assert.equal(await body.evaluate((e) => e.classList.contains("swipe-open")), true, "seuil franchi : la ligne reste ouverte sur le bouton rouge");
assert.deepEqual(await page.evaluate(() => window.__vib.slice()), [10], "une vibration courte à l'ouverture");
// ouvrir l'autre ligne referme la première (une seule ouverte à la fois)
const body2 = await swipeLeft(page, "Supprimer Impôts", 70);
await release(page); await page.waitForTimeout(300);
assert.equal(await body2.evaluate((e) => e.classList.contains("swipe-open")), true, "la deuxième ligne s'ouvre");
assert.equal(await body.evaluate((e) => e.classList.contains("swipe-open")), false, "la première s'est refermée");
ok("glissement au-delà du seuil : rouge révélé avec une vibration, une seule ligne ouverte à la fois");
// le tap sur le rouge déclenche la même suppression (avec annulation) que l'icône corbeille
await page.locator('.swipe-wrap:has(button[aria-label="Supprimer Impôts"]) .swipe-del').click();
await page.waitForTimeout(100);
assert.equal(await page.locator('[data-view="agenda"]').getByText("Impôts").count(), 0, "la ligne disparaît tout de suite (suppression optimiste)");
assert.match(await page.locator("#toast").textContent(), /Date supprimée\.\s*Annuler/, "la bannière « Annuler » du répartiteur central s'affiche, comme pour l'icône corbeille");
await page.locator("#toast .toast-act").click(); await page.waitForTimeout(100);
assert.equal(await page.locator('[data-view="agenda"]').getByText("Impôts").count(), 1, "« Annuler » la restaure");
await ctx.close();
ok("le bouton rouge révélé passe par le même répartiteur et la même bannière « Annuler » que l'icône corbeille");

// ---- 9. Menu contextuel (appui long sur une ligne du Coffre ou de l'Agenda) : mêmes actions que les
// icônes de la ligne, dans une feuille nommée ; appui court ou doigt qui bouge -> rien ; aucune action
// sur une ligne sans icône (Dossiers) ; une entrée déclenche la même action (et la même annulation) que
// l'icône correspondante.
async function longPress(page, locator, ms = 600) {
  const box = await locator.boundingBox();
  const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await locator.evaluate((el, p) => {
    const t = new Touch({ identifier: 9, target: el, clientX: p.x, clientY: p.y });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [t], bubbles: true, cancelable: true }));
  }, pt);
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true, cancelable: true })));
  return pt;
}
({ ctx, page } = await open());
await page.goto(BASE + "/#agenda"); await page.waitForTimeout(200);
await page.fill("#a-title", "Audience prud'homale"); await page.fill("#a-date", "2031-05-20");
await page.click('#agendaForm button[type="submit"]'); await page.waitForTimeout(250);
const dateRow = page.locator('.dt-row:has-text("Audience prud\'homale")');
await longPress(page, dateRow, 300);
await page.waitForTimeout(150);
assert.equal(await page.locator("#rowMenu").isHidden(), true, "appui trop court : pas de menu");
await longPress(page, dateRow);
await page.waitForTimeout(150);
assert.equal(await page.locator("#rowMenu").isHidden(), false, "appui long : le menu s'ouvre");
assert.equal(await page.locator("#rowMenuTitle").textContent(), "Audience prud'homale", "le menu nomme la ligne");
assert.deepEqual(await page.locator(".row-menu-item").allTextContents(), ["Supprimer"], "les mêmes actions que l'icône de la ligne (ici, une seule)");
await page.waitForTimeout(350); // passé la garde anti-clic-fantôme (doigt resté sur place au relâché)
await page.locator("#rowMenuScrim").click({ position: { x: 10, y: 10 } });
await page.waitForTimeout(300);
assert.equal(await page.locator("#rowMenu").isHidden(), true, "un tap en dehors referme le menu, sans rien déclencher");
assert.equal(await page.locator('[data-view="agenda"]').getByText("Audience prud'homale").count(), 1, "la ligne est toujours là");
await longPress(page, dateRow);
await page.waitForTimeout(150);
await page.locator(".row-menu-item", { hasText: "Supprimer" }).click();
await page.waitForTimeout(300);
assert.equal(await page.locator("#rowMenu").isHidden(), true, "le menu se referme après l'action");
assert.equal(await page.locator('[data-view="agenda"]').getByText("Audience prud'homale").count(), 0, "« Supprimer » depuis le menu agit, comme l'icône corbeille");
assert.match(await page.locator("#toast").textContent(), /Date supprimée\.\s*Annuler/, "même bannière « Annuler »");
await ctx.close();
({ ctx, page } = await open());
await page.goto(BASE + "/#vault"); await page.waitForTimeout(200);
const addW = await page.locator('[data-act="vault-add"]').evaluate((e) => e.getBoundingClientRect().width);
const camW = await page.locator('[data-act="vault-cam"]').evaluate((e) => e.getBoundingClientRect().width);
assert.ok(Math.abs(addW - camW) <= 1, `Coffre : « Ajouter un document » et « Photographier » de même largeur (${addW} vs ${camW})`);
ok("Coffre : les deux boutons d'action ont la même largeur");
const docRow = page.locator('[data-view="vault"] .dt-row').first();
await longPress(page, docRow);
await page.waitForTimeout(150);
assert.ok((await page.locator(".row-menu-item").allTextContents()).includes("Ajouter une date liée"), "Coffre : les actions de la ligne (ajouter une date, supprimer…) apparaissent aussi");
await ctx.close();
ok("menu contextuel (appui long) : mêmes actions que la ligne, nommé, refermable sans effet, une entrée agit comme l'icône correspondante");

await browser.close();
if (problems.length) { console.log("PROBLÈMES :"); for (const p of problems) console.log(p); process.exit(1); }

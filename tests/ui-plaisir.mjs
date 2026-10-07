// Moments de plaisir : frise des dates limites d'un plan, carte « Toutes les étapes sont faites »
// avec une petite gerbe (coupée si « moins de mouvement »), illustrations des écrans vides.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(reduced, hash = "/#home") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + hash); await page.waitForTimeout(300);
  return { ctx, page };
}
const day = (k) => new Date(Date.now() + k * 864e5).toISOString().slice(0, 10);
async function visaPlan(page, expIn) {
  await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
  const pick = async (t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(220); };
  await pick("déjà à Madagascar"); await pick("visa de séjour d'immigrant");
  await page.fill('#vieBody input[type="date"]', day(expIn));
  await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(220);
  await pick("Oui"); await page.waitForTimeout(300);
}

// ---- 1. Frise : aujourd'hui + chaque date limite, dans l'ordre, couleur selon l'urgence
let { ctx, page } = await open(true);
await visaPlan(page, 40);
const fr = await page.evaluate(() => {
  const f = document.querySelector(".vie-frise");
  if (!f) return null;
  const pts = [...f.querySelectorAll(".pt")].map((p) => ({ cls: p.className.replace("pt ", ""), left: parseFloat(p.style.left) }));
  return { pts, labels: [...f.querySelectorAll(".lb")].map((l) => l.textContent), aria: f.getAttribute("aria-label"), cards: document.querySelectorAll(".vie-dl").length };
});
assert.ok(fr, "la frise est affichée au-dessus des dates limites");
assert.equal(fr.pts.length, fr.cards + 1, "un point par date limite, plus aujourd'hui");
assert.ok(fr.labels.includes("Aujourd'hui"));
assert.ok(fr.pts.some((p) => p.cls === "late"), "une date dépassée est en rouge");
assert.ok(fr.pts.some((p) => p.cls === "ok"), "une date lointaine est en vert");
const now = fr.pts.find((p) => p.cls === "now").left, late = fr.pts.find((p) => p.cls === "late").left, fut = fr.pts.find((p) => p.cls === "ok").left;
assert.ok(late < now && now < fut, "dépassée à gauche d'aujourd'hui, à venir à droite");
assert.match(fr.aria, /aujourd'hui, puis/, "la frise est décrite pour les lecteurs d'écran");
ok("frise : aujourd'hui et chaque date limite à leur place, couleur selon l'urgence, décrite en clair");

// ---- 2. Fin de plan : la carte n'apparaît qu'une fois toutes les étapes cochées
const boxes = page.locator("#vieBody ol.vie-list input[type=checkbox]");
const count = await boxes.count();
assert.ok(count >= 2);
assert.equal(await page.locator(".vie-done").isVisible(), false, "rien tant que les étapes ne sont pas faites");
for (let i = 0; i < count - 1; i++) await boxes.nth(i).check();
assert.equal(await page.locator(".vie-done").isVisible(), false);
await boxes.nth(count - 1).check(); await page.waitForTimeout(80);
assert.equal(await page.locator(".vie-done").isVisible(), true, "dernière étape cochée : bravo");
assert.match(await page.locator(".vie-done").innerText(), /Toutes les étapes sont faites/);
assert.equal(await page.locator(".vie-done").getAttribute("role"), "status", "annoncé aux lecteurs d'écran");
assert.equal(await page.locator(".burst").count(), 0, "pas de gerbe en « moins de mouvement »");
await boxes.nth(0).uncheck(); await page.waitForTimeout(50);
assert.equal(await page.locator(".vie-done").isVisible(), false, "une étape décochée : la carte disparaît");
await boxes.nth(0).check();
await page.reload(); await page.waitForTimeout(400);
assert.equal(await page.locator(".vie-done").isVisible(), true, "retrouvée après rechargement");
assert.doesNotMatch(await page.locator(".vie-done").getAttribute("class"), /pop/, "sans animation au rechargement");
await page.locator(".vie-done .link-btn").click(); await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => location.hash), "#vault", "« Ouvrir le coffre » mène au coffre");
await ctx.close();
ok("fin de plan : carte de réussite à la dernière étape, retirée si on décoche, gardée au rechargement");

// ---- 3. Gerbe : seulement quand le mouvement est permis, puis retirée
({ ctx, page } = await open(false));
await visaPlan(page, 40);
const b2 = page.locator("#vieBody ol.vie-list input[type=checkbox]");
const c2 = await b2.count();
for (let i = 0; i < c2; i++) await b2.nth(i).check();
await page.waitForTimeout(60);
assert.ok(await page.locator(".vie-done .burst i").count() >= 10, "une gerbe de confettis apparaît");
assert.match(await page.locator(".vie-done").getAttribute("class"), /pop/);
await page.waitForTimeout(1400);
assert.equal(await page.locator(".burst").count(), 0, "la gerbe est retirée après l'animation");
await ctx.close();
ok("gerbe de confettis à la réussite, retirée ensuite (rien si « moins de mouvement »)");

// ---- 4. Écrans vides illustrés : dossiers, coffre, agenda, recherche sans résultat
({ ctx, page } = await open(true));
await page.evaluate(() => localStorage.removeItem("dm_state_v2"));
const artOf = (sel) => page.locator(sel).evaluate((e) => !!e && e.getBoundingClientRect().width > 0 && e.innerHTML.length > 100);
for (const [h, sel] of [["vault", '[data-view="vault"] .dt-empty .art'], ["agenda", '[data-view="agenda"] .dt-empty .art']]) {
  await page.goto(BASE + "/#" + h); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.querySelector('[data-view]:not([hidden]) [data-act="clear-examples"]'); if (b) b.click(); });
  await page.waitForTimeout(250);
  assert.ok(await artOf(sel), "illustration de l'écran vide : " + h);
}
await page.goto(BASE + "/#cases"); await page.waitForTimeout(300);
if (await page.locator("#casesEmpty").isVisible()) {
  assert.ok(await artOf("#casesEmpty .art"), "illustration des dossiers vides");
  assert.equal(await page.locator("#casesEmptyLife .life-b").count(), 3, "dossiers vides : 3 situations fréquentes suggérées");
  const firstGo = await page.locator("#casesEmptyLife .life-b").first().getAttribute("data-go");
  await page.locator("#casesEmptyLife .life-b").first().click(); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), "#" + firstGo, "une suggestion mène bien au parcours");
}
await ctx.close();
({ ctx, page } = await open(true, "/#agenda"));
await page.locator('[data-view="agenda"] input[type="search"]').pressSequentially("zzzzqqq", { delay: 10 }); await page.waitForTimeout(300);
assert.match(await page.locator('[data-view="agenda"] .dt-empty').innerText(), /Aucun résultat/);
assert.ok(await artOf('[data-view="agenda"] .dt-empty .art'), "illustration de la recherche sans résultat");
const strokes = await page.locator('[data-view="agenda"] .dt-empty .art .ln').first().evaluate((e) => getComputedStyle(e).stroke);
assert.notEqual(strokes, "none", "l'illustration prend les couleurs du thème");
await ctx.close();
ok("écrans vides illustrés (coffre, agenda, dossiers, recherche sans résultat), aux couleurs du thème ; dossiers vides : 3 suggestions de situations fréquentes, cliquables");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

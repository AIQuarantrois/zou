// Animations : révélation des blocs au défilement, décompte des jours, ressort de la case cochée,
// recherche animée puis réponse en fondu — le tout coupé si l'appareil demande « moins de mouvement ».
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(reduced) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + "/#home");
  await page.waitForSelector(".life-b, .hero", { state: "attached" });
  await page.waitForTimeout(150);
  return { ctx, page };
}
const cls = (page, sel) => page.locator(sel).first().evaluate((e) => e.className);
const opacity = (page, sel) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).opacity);
async function plan(page) {
  await page.goto(BASE + "/#vie.naissance"); await page.waitForTimeout(250);
  await page.locator(".vie-chips .chip-btn", { hasText: "Aujourd'hui" }).click();
  await page.locator(".vie-opt", { hasText: "hôpital" }).click(); await page.waitForTimeout(220);
  for (const t of ["Non", "Oui"]) { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(200); }
  await page.locator(".vie-opt", { hasText: "Oui, les deux" }).click(); await page.waitForTimeout(200);
  await page.locator(".vie-opt", { hasText: "Oui, on peut" }).click(); await page.waitForTimeout(350);
}

// ---- 1. Mouvement actif : le héros est révélé (fondu), les blocs portent la classe de révélation
let { ctx, page } = await open(false);
await page.waitForTimeout(500);
assert.match(await cls(page, ".hero"), /\b(reveal|in)\b/, "le héros est préparé pour la révélation");
assert.equal(await opacity(page, ".hero"), "1", "après révélation, le héros est pleinement visible");
assert.ok(await page.locator('[data-view="home"] .section.reveal, [data-view="home"] .section.in').count() > 0, "les sections de l'accueil sont révélées");
await ctx.close();
ok("accueil : le héros et les sections apparaissent en fondu (révélation au défilement)");

// ---- 2. Décompte : le nombre de jours finit sur la bonne valeur ; verdict et sections révélés
({ ctx, page } = await open(false));
await plan(page);
await page.waitForTimeout(700);
assert.match(await page.locator(".vie-dl-cd").first().innerText(), /Il reste 30 jours/, "le décompte se pose sur 30 jours");
assert.match(await cls(page, ".vie-verdict"), /\b(reveal|in)\b/, "le verdict est révélé");
assert.ok(await page.locator(".vie-sec.reveal, .vie-sec.in").count() > 0, "les sections du plan sont révélées");
await ctx.close();
ok("plan : le décompte monte jusqu'à sa valeur, verdict et sections apparaissent");

// ---- 3. Case cochée : petit ressort (animation) ; assistant : réponse en fondu
({ ctx, page } = await open(false));
await plan(page);
const box = page.locator("#vieBody .vie-list input[type=checkbox]").first();
await box.check(); await page.waitForTimeout(50);
assert.equal(await box.evaluate((e) => getComputedStyle(e).animationName), "zou-pop", "la case cochée fait un ressort");
await page.goto(BASE + "/#home"); await page.waitForTimeout(200);
await page.fill("#askInput", "Quel préavis pour une démission ?");
await page.press("#askInput", "Enter");
await page.waitForFunction(() => /Réponse de test/.test(document.querySelector("#askBody").textContent), null, { timeout: 8000 });
assert.ok(await page.locator("#askBody.ans-in").count() === 1, "la réponse apparaît en fondu");
await ctx.close();
ok("case cochée : ressort ; assistant : réponse en fondu");

// ---- 4. « Moins de mouvement » : aucune animation, aucun bloc masqué
({ ctx, page } = await open(true));
await page.waitForTimeout(200);
assert.equal(await opacity(page, ".hero"), "1");
assert.doesNotMatch(await cls(page, ".hero"), /\breveal\b/, "aucun bloc n'est masqué pour animation");
await plan(page);
assert.match(await page.locator(".vie-dl-cd").first().innerText(), /Il reste 30 jours/, "le décompte est posé directement");
assert.doesNotMatch(await cls(page, ".vie-verdict"), /\breveal\b/);
const box2 = page.locator("#vieBody .vie-list input[type=checkbox]").first();
await box2.check(); await page.waitForTimeout(50);
assert.equal(await box2.evaluate((e) => getComputedStyle(e).animationName), "none", "la case ne fait pas de ressort");
await ctx.close();
ok("« moins de mouvement » : rien n'est masqué ni animé, décompte posé directement");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

// Regroupement par thèmes (accueil, menu, services, pied de page) et style des plans, dans un vrai navigateur.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + "/");
  await page.waitForSelector(".life-b");
  return { ctx, page };
}
const noHScroll = async (page, label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "défilement horizontal : " + label);

// ---- Téléphone : accueil
let { page } = await open({ width: 390, height: 844 });
const visibleTiles = await page.locator("#lifeGrid .life-b:visible").count();
assert.equal(visibleTiles, 8);
assert.equal(await page.locator("#lifeMore").evaluate((d) => d.open), false);
assert.match(await page.locator("#lifeMore summary").innerText(), /Voir les \d+ autres situations/);
assert.equal(await page.locator("#homeTopics .topic").count(), 5);
const topicsText = await page.locator("#homeTopics").innerText();
for (const t of ["Famille et papiers", "Travail et protection", "Logement et biens", "Entreprise", "Justice"]) assert.ok(topicsText.includes(t), t);
assert.equal(await page.locator("#homeTiles, #homeDomains").count(), 0);
await noHScroll(page, "accueil");
ok("accueil : 8 situations en vedette, les autres repliées, 5 thèmes (la longue liste de domaines a disparu)");

await page.locator("#lifeMore summary").click();
assert.ok(await page.locator("#lifeAll .life-grp h3").count() >= 3);
assert.ok(await page.locator("#lifeAll .life-b:visible").count() >= 10);
await noHScroll(page, "accueil déplié");
ok("accueil : « Voir les autres situations » déplie les situations classées par thème");

// L'urgence : une étiquette de texte, plus de bordure rouge
const urgent = page.locator("#lifeGrid .life-b.urgent").first();
assert.match(await urgent.innerText(), /urgent/i);
const bw = await urgent.evaluate((e) => { const c = getComputedStyle(e); return [c.borderTopColor, c.borderLeftColor, c.borderTopWidth, c.borderLeftWidth]; });
assert.equal(bw[0], bw[1]); assert.equal(bw[2], bw[3]);
assert.equal(await page.locator("#lifeGrid .life-b.urgent").count(), 2);
ok("situations urgentes : étiquette « Urgent » (2 seulement), bordure identique sur les quatre côtés");

// ---- Reprendre : un parcours commencé réapparaît
await page.locator("#lifeGrid .life-b", { hasText: "Un proche est décédé" }).click();
await page.waitForSelector(".vie-title");
await page.locator(".vie-chips .chip-btn", { hasText: "Hier" }).click(); await page.waitForTimeout(250);
await page.goto(BASE + "/#home");
await page.waitForSelector("#homeResume:not([hidden])");
assert.match(await page.locator("#homeResumeList").innerText(), /Un proche est décédé/);
assert.match(await page.locator("#homeResumeList").innerText(), /Question 2 sur/);
ok("accueil : le parcours commencé apparaît dans « Reprendre »");

// ---- Plan : verdict sans barre asymétrique, étiquette d'état, étapes sans pastille
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
const pick = async (t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(220); };
await pick("Je prépare mon voyage"); await pick("Trois mois ou moins"); await pick("Tourisme");
const vd = page.locator(".vie-verdict").first();
const sides = await vd.evaluate((e) => { const c = getComputedStyle(e); return ["Top", "Right", "Bottom", "Left"].map((s) => c["border" + s + "Width"]); });
assert.deepEqual(sides, ["0px", "0px", "0px", "0px"]);
assert.match(await vd.locator(".vie-verdict-l").innerText(), /à savoir|attention|urgent/i);
assert.match(await page.locator(".vie-n").first().innerText(), /^étape 1$/i);
const dots = await page.locator(".vie-n").first().evaluate((e) => getComputedStyle(e).backgroundColor);
assert.equal(dots, "rgba(0, 0, 0, 0)");
await noHScroll(page, "plan visa");
ok("plan : verdict sans bordure ni barre colorée, étiquette d'état en toutes lettres, « Étape 1 » sans pastille");

// ---- Services : thèmes
await page.goto(BASE + "/#services.g-justice"); await page.waitForTimeout(400);
assert.equal(await page.locator("#svcGroups .svc-g").count(), 6);
assert.match(await page.locator("#svcGroups .svc-g.on").innerText(), /Justice/);
const svc = await page.locator('[data-view="services"]').innerText();
assert.match(svc, /Procédure pénale/); assert.doesNotMatch(svc, /Un enfant vient de naître/); assert.doesNotMatch(svc, /Séjour des étrangers/);
await page.locator("#svcGroups .svc-g", { hasText: "Famille et papiers" }).click(); await page.waitForTimeout(300);
const svc2 = await page.locator('[data-view="services"]').innerText();
assert.match(svc2, /Un enfant vient de naître/); assert.match(svc2, /venir ou rester/); assert.doesNotMatch(svc2, /Procédure pénale/);
await page.goto(BASE + "/#services.copro"); await page.waitForTimeout(300);
assert.match(await page.locator("#svcGroups .svc-g.on").innerText(), /Logement et biens/);
assert.match(await page.locator('[data-view="services"]').innerText(), /3 services sur \d+/);
await noHScroll(page, "services");
ok("services : onglets par thème, un thème ne montre que ses domaines, un domaine active son thème");
await page.close();

// ---- Écran large : menu et pied de page
({ page } = await open({ width: 1280, height: 900 }));
await page.locator('button[aria-controls="mega"], .head-link[aria-haspopup], #megaBtn').first().click().catch(() => {});
await page.evaluate(() => { const m = document.getElementById("mega"); if (m) m.hidden = false; });
assert.equal(await page.locator("#megaIn .mega-g").count(), 5);
assert.equal(await page.locator("#megaIn .mega-l").count(), 10);
assert.equal(await page.locator("#footDomains a").count(), 5);
ok("menu : 5 colonnes par thème avec leurs 10 domaines ; pied de page : 5 thèmes");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

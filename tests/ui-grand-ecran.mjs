// Tablette et ordinateur : colonne d'icônes (768 à 1199 px) puis barre latérale avec libellés (1200 px et plus)
// à la place des onglets du bas ; « Plus » en panneau à côté de la colonne ; deux panneaux sur ordinateur
// (Services ou Dossiers à gauche, le détail à droite) ; calculateur de préavis (catégorie affichée).
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(viewport, hash = "/") {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + hash);
  await page.waitForSelector(".life-b, .q-row, .row-t, .vie-title", { state: "attached" });
  await page.waitForTimeout(200);
  return { ctx, page };
}
const vis = (page, sel) => page.locator(sel).first().isVisible();
const cur = (page, sel) => page.locator(sel).first().getAttribute("aria-current");
const noHScroll = async (page, label) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "défilement horizontal : " + label);
const goGuide = async (page, i = 0) => { await page.locator('[data-view="services"] [data-go^="guide."]').nth(i).click(); await page.waitForTimeout(300); };

// ---- 1. Tablette : colonne d'icônes, pas d'onglets en bas, « Plus » en panneau à côté
let { ctx, page } = await open({ width: 820, height: 1180 });
assert.equal(await vis(page, ".tabs"), false, "pas d'onglets en bas sur tablette");
assert.equal(await vis(page, "#sideNav"), true);
assert.equal(await page.locator("#sideNav .side-main > li:visible").count(), 5);
assert.equal(await vis(page, "#sideMore"), true);
assert.equal(await vis(page, "#sideGroups"), false, "les thèmes ne s'affichent qu'avec la barre large");
assert.equal(await cur(page, '.side-i[data-side="home"]'), "page");
const mainLeft = await page.evaluate(() => document.getElementById("main").getBoundingClientRect().left);
assert.equal(Math.round(mainLeft), 88, "le contenu commence après la colonne");
await page.locator('.side-i[data-side="services"]').click(); await page.waitForTimeout(250);
assert.equal(await page.evaluate(() => location.hash), "#services");
assert.equal(await cur(page, '.side-i[data-side="services"]'), "page");
assert.equal(await cur(page, '.side-i[data-side="home"]'), null);
await page.locator("#sideMore").click(); await page.waitForTimeout(300);
assert.equal(await page.locator("#moreSheet").isVisible(), true);
assert.equal(await page.locator("#sideMore").getAttribute("aria-expanded"), "true");
const sh = await page.locator("#moreSheet").boundingBox();
assert.ok(sh.x >= 88 && sh.width <= 420, "panneau à côté de la colonne, pas en pleine largeur");
assert.equal(await vis(page, ".sheet-grab"), false);
await page.keyboard.press("Escape").catch(() => {});
await page.locator("#scrim").click({ position: { x: 700, y: 300 } }).catch(() => {}); await page.waitForTimeout(350);
assert.equal(await page.locator("#moreSheet").isHidden(), true);
assert.equal(await page.locator("#sideMore").getAttribute("aria-expanded"), "false");
await page.goto(BASE + "/#services.travail"); await page.waitForTimeout(250);
await goGuide(page);
assert.equal(await vis(page, "#headBack"), true, "retour dans l'en-tête sur tablette");
assert.equal(await page.locator("#main > .wrap").evaluate((w) => w.classList.contains("split")), false, "un seul panneau sur tablette");
await noHScroll(page, "tablette guide");
await ctx.close();
ok("tablette : colonne d'icônes à la place des onglets, « Plus » en panneau à côté, retour dans l'en-tête");

// ---- 2. Ordinateur : barre latérale avec libellés, thèmes, rubriques ; plus de menu en haut ni de feuille
({ ctx, page } = await open({ width: 1440, height: 900 }));
assert.equal(await vis(page, ".head-nav"), false, "la barre latérale remplace le menu du haut");
assert.equal(await vis(page, "#sideMore"), false);
assert.equal(await page.locator("#sideGroups a").count(), 5);
for (const t of ["Dossiers", "Coffre", "Agenda", "Urgence", "Où aller", "Textes juridiques", "Centre d'aide", "Affichage et lisibilité", "Mon compte", "Espace professionnel"]) assert.equal(await page.locator("#sideNav a", { hasText: t }).first().isVisible(), true, "manque : " + t);
assert.equal(Math.round(await page.evaluate(() => document.getElementById("main").getBoundingClientRect().left)), 248);
const head = await page.locator("#siteHead").boundingBox();
assert.equal(Math.round(head.width), 1440, "en-tête pleine largeur");
await page.goto(BASE + "/#services.travail"); await page.waitForTimeout(250);
assert.equal(await cur(page, '#sideGroups a[data-go="services.g-travail-protection"]'), "page", "le domaine Travail allume son thème");
assert.equal(await cur(page, '.side-i[data-side="services"]'), "page");
await page.locator('#sideNav a[data-sub="vault"]').click(); await page.waitForTimeout(250);
assert.equal(await page.evaluate(() => location.hash), "#vault");
assert.equal(await cur(page, '#sideNav a[data-sub="vault"]'), "page");
assert.equal(await cur(page, '.side-i[data-side="space"]'), "page");
await page.locator('#sideNav a[data-sub="display"]').click(); await page.waitForTimeout(250);
assert.equal(await cur(page, '#sideNav a[data-sub="display"]'), "page");
assert.equal(await vis(page, "#siteFoot"), true);
await noHScroll(page, "ordinateur");
ok("ordinateur : barre latérale (thèmes, Mon espace, aide, réglages) avec l'état courant, en-tête pleine largeur");

// ---- 3. Deux panneaux : Services à gauche, le guide à droite ; la liste suit la sélection
await page.goto(BASE + "/#services.travail"); await page.waitForTimeout(250);
await goGuide(page, 0);
const wrapSplit = () => page.locator("#main > .wrap").evaluate((w) => w.classList.contains("split"));
assert.equal(await wrapSplit(), true);
assert.equal(await page.locator('[data-view="services"]').isVisible(), true, "la liste reste affichée");
assert.equal(await page.locator('[data-view="guide"]').isVisible(), true);
const g1 = await page.evaluate(() => location.hash);
assert.equal(await page.locator(`[data-view="services"] [data-go="${g1.slice(1)}"]`).first().getAttribute("aria-current"), "true", "la ligne ouverte est marquée");
const boxes = await page.evaluate(() => ["services", "guide"].map((v) => { const r = document.querySelector(`[data-view="${v}"]`).getBoundingClientRect(); return [r.left, r.right]; }));
assert.ok(boxes[0][1] <= boxes[1][0], "la liste est à gauche du détail");
assert.equal(await page.locator('[data-view="guide"] .guide-grid').evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(" ").length), 1, "le guide passe sur une colonne dans son panneau");
assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "h-guide", "le focus va au titre du détail");
await goGuide(page, 1);
const g2 = await page.evaluate(() => location.hash);
assert.notEqual(g2, g1);
assert.equal(await wrapSplit(), true);
assert.equal(await page.locator(`[data-view="services"] [data-go="${g1.slice(1)}"]`).first().getAttribute("aria-current"), null);
assert.equal(await page.locator(`[data-view="services"] [data-go="${g2.slice(1)}"]`).first().getAttribute("aria-current"), "true");
await page.setViewportSize({ width: 1100, height: 900 }); await page.waitForTimeout(250);
assert.equal(await wrapSplit(), false, "plus de deux panneaux sous 1200 px");
assert.equal(await page.locator('[data-view="services"]').isVisible(), false);
await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(250);
assert.equal(await wrapSplit(), true, "les deux panneaux reviennent");
await page.locator("#guideCrumb button", { hasText: "Travail" }).click(); await page.waitForTimeout(250);
assert.equal(await wrapSplit(), false, "revenir à la liste referme le détail");
await page.goBack(); await page.waitForTimeout(250);
await noHScroll(page, "deux panneaux");
ok("deux panneaux : liste à gauche, détail à droite, ligne ouverte marquée, retour à un panneau sous 1200 px");

// ---- 4. Un parcours ouvert depuis l'accueil reste en pleine page ; depuis Dossiers, en deux panneaux
await page.goto(BASE + "/#home"); await page.waitForTimeout(250);
await page.locator("#lifeGrid .life-b, #lifeAll .life-b", { hasText: "Un enfant vient de naître" }).click(); await page.waitForTimeout(250);
assert.equal(await wrapSplit(), false, "depuis l'accueil : pleine page");
await page.locator(".vie-chips .chip-btn", { hasText: "Aujourd'hui" }).click();
await page.locator(".vie-opt", { hasText: "hôpital" }).click(); await page.waitForTimeout(250);
await page.goto(BASE + "/#cases"); await page.waitForTimeout(300);
await page.locator('[data-view="cases"] [data-go="vie.naissance"]').first().click(); await page.waitForTimeout(300);
assert.equal(await wrapSplit(), true, "depuis Dossiers : deux panneaux");
assert.equal(await page.locator('[data-view="cases"]').isVisible(), true);
assert.equal(await page.locator('[data-view="vie"]').isVisible(), true);
await noHScroll(page, "dossiers");
await ctx.close();
ok("parcours : pleine page depuis l'accueil, deux panneaux depuis Dossiers");

// ---- 5. Calculateur de préavis : la catégorie choisie s'affiche en clair (et plus « [object Object] »)
({ ctx, page } = await open({ width: 1440, height: 900 }, "/#answer"));
await page.waitForSelector("#group", { state: "attached" });
await page.selectOption("#group", { index: 2 }); await page.waitForTimeout(100);
const hint = await page.locator("#groupHint").textContent();
assert.doesNotMatch(hint, /object/);
assert.match(hint, /Ouvriers très qualifiés/);
await ctx.close();
ok("calculateur de préavis : la catégorie choisie s'affiche en clair");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

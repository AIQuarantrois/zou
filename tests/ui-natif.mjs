// Sensation d'application native sur téléphone : en-tête d'écran (retour + titre qui apparaît au défilement),
// animations d'écran, feuille « Plus » (poignée, glisser vers le bas), mémoire des onglets, pied de page rangé
// dans « Plus », barre de thèmes de Services, écrans de démarrage iPhone. Écran large : rien de tout cela.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, hasTouch: !!opts.touch, isMobile: !!opts.touch, reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + (opts.hash || "/"));
  await page.waitForSelector(".life-b, .vie-title, .q-row", { state: "attached" });
  await page.waitForTimeout(150);
  return { ctx, page };
}
const shown = (page, sel) => page.locator(sel).isVisible();
const noHScroll = async (page, label) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "défilement horizontal : " + label);

// ---- 1. En-tête d'écran : logo sur les racines, retour + titre sur les écrans empilés
let { ctx, page } = await open();
assert.equal(await shown(page, "#siteHead .brand"), true);
assert.equal(await shown(page, "#headBack"), false);
await page.locator("#lifeMore").evaluate((d) => { d.open = true; });
await page.locator(".life-b", { hasText: "Un enfant vient de naître" }).click();
await page.waitForTimeout(350);
assert.equal(await shown(page, "#siteHead .brand"), false, "le logo laisse la place au retour");
assert.equal(await shown(page, "#headBack"), true);
assert.equal((await page.locator("#headBackT").textContent()).trim(), "Famille");
assert.equal(await page.locator("#headBack").getAttribute("aria-label"), "Retour : Famille");
assert.equal(await shown(page, "#vieBack"), false, "le retour dans la page est remplacé par celui de l'en-tête");
assert.match(await page.locator("#headTitle").textContent(), /naissance/i);
assert.equal(await page.locator("#headTitle").evaluate((e) => e.classList.contains("on")), true, "sur une question, le titre d'écran reste affiché");
await page.locator("#headBack").click();
await page.waitForTimeout(350);
assert.match(await page.evaluate(() => location.hash), /^#services/);
assert.equal(await shown(page, "#headBack"), false);
assert.equal(await shown(page, "#siteHead .brand"), true);
ok("en-tête : logo sur les écrans racines ; sur un parcours, « ‹ Famille » et le titre, retour par l'en-tête");

// ---- 2. Grand titre qui se replie dans l'en-tête ; fil d'Ariane remplacé par le retour
await page.goto(BASE + "/#services.travail"); await page.waitForTimeout(300);
await page.locator('[data-view="services"] [data-go^="guide."]').first().click();
await page.waitForTimeout(400);
assert.equal(await shown(page, "#guideCrumb"), false);
assert.equal(await shown(page, "#headBack"), true);
assert.match(await page.locator("#headBackT").textContent(), /Travail/);
const big = (await page.locator("#h-guide").textContent()).trim();
assert.equal((await page.locator("#headTitle").textContent()).trim(), big);
assert.equal(await page.locator("#headTitle").evaluate((e) => e.classList.contains("on")), false, "titre caché tant que le grand titre est visible");
await page.mouse.wheel(0, 600); await page.waitForTimeout(400);
assert.equal(await page.locator("#headTitle").evaluate((e) => e.classList.contains("on")), true, "titre affiché une fois le grand titre passé sous l'en-tête");
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
assert.equal(await page.locator("#headTitle").evaluate((e) => e.classList.contains("on")), false);
await noHScroll(page, "guide");
ok("grand titre replié dans l'en-tête au défilement ; fil d'Ariane remplacé par « ‹ Travail »");

// ---- 3. Animations : l'écran suivant glisse depuis la droite, le retour depuis la gauche, les onglets sans animation
await page.goto(BASE + "/#home"); await page.waitForTimeout(300);
const cls = () => page.evaluate(() => document.querySelector("[data-view]:not([hidden])").className);
await page.locator(".life-b", { hasText: "Un proche est décédé" }).click();
assert.match(await cls(), /nav-push/);
await page.waitForTimeout(400);
assert.doesNotMatch(await cls(), /nav-push/, "la classe d'animation est retirée à la fin");
await page.goBack(); await page.waitForTimeout(30);
assert.match(await cls(), /nav-pop/);
await page.waitForTimeout(400);
await page.locator('.tab[data-tab="pros"]').click();
assert.doesNotMatch(await cls(), /nav-/);
await page.goto(BASE + "/#vie.naissance"); await page.waitForTimeout(300);
await page.locator(".vie-chips .chip-btn", { hasText: "Aujourd'hui" }).click();
await page.locator(".vie-opt", { hasText: "hôpital" }).click(); await page.waitForTimeout(170);
assert.match(await page.locator("#vieBody").getAttribute("class"), /nav-push/, "question suivante : glisse depuis la droite");
await page.waitForTimeout(350);
await page.locator(".vie-backstep").click();
assert.match(await page.locator("#vieBody").getAttribute("class"), /nav-pop/, "question précédente : depuis la gauche");
await ctx.close();
({ ctx, page } = await open({ reduced: true }));
await page.locator(".life-b", { hasText: "Un proche est décédé" }).click();
assert.doesNotMatch(await cls(), /nav-/, "aucune animation si l'appareil demande moins de mouvement");
await ctx.close();
ok("animations : poussée à l'aller, retour à l'inverse, onglets instantanés, aucune si « moins de mouvement »");

// ---- 3 bis. Écran fantôme : l'écran qui part glisse aussi (dans l'autre sens), par un clone jetable —
// pas la vraie API View Transitions (son callback asynchrone casserait show()/go(), écrits comme synchrones
// partout — essayé, abandonné pour cette raison, voir ghostOut). Repart d'où l'œil l'a laissé (défilement
// compensé), pas du haut de l'écran ; rien sur un onglet, en « moins de mouvement » ou sur grand écran.
({ ctx, page } = await open());
await page.goto(BASE + "/#home"); await page.waitForTimeout(300);
await page.mouse.wheel(0, 300); await page.waitForTimeout(150);
const scrollY = await page.evaluate(() => window.pageYOffset);
assert.ok(scrollY > 0, "défilé avant de naviguer, pour vérifier la compensation");
await page.locator(".life-b", { hasText: "Je veux démissionner" }).click();
const ghost = page.locator(".ghost-wrap");
assert.equal(await ghost.count(), 1, "un clone jetable apparaît, même en ayant défilé");
assert.equal(await ghost.evaluate((e) => e.classList.contains("ghost-pop")), false, "aller : pas la classe de retour");
const vcTransform = await page.locator(".ghost-view-clip > *").evaluate((e, y) => e.style.transform === "translateY(-" + y + "px)", scrollY);
assert.equal(vcTransform, true, "le clone de l'écran repart décalé du défilement en cours, pas de son propre haut");
await page.waitForTimeout(500);
assert.equal(await ghost.count(), 0, "le clone est retiré une fois l'animation finie");
await page.locator("#headBack").click();
assert.equal(await page.locator(".ghost-wrap.ghost-pop").count(), 1, "retour : la classe de retour (glisse dans l'autre sens)");
await page.waitForTimeout(500);
assert.equal(await page.locator(".ghost-wrap").count(), 0);
await page.locator('.tab[data-tab="pros"]').click(); await page.waitForTimeout(50);
assert.equal(await page.locator(".ghost-wrap").count(), 0, "rien sur un changement d'onglet");
await ctx.close();
({ ctx, page } = await open({ reduced: true }));
await page.locator(".life-b", { hasText: "Un proche est décédé" }).click();
assert.equal(await page.locator(".ghost-wrap").count(), 0, "rien en « moins de mouvement »");
await ctx.close();
({ ctx, page } = await open({ viewport: { width: 1280, height: 900 } }));
await page.locator(".life-b", { hasText: "Un proche est décédé" }).click();
assert.equal(await page.locator(".ghost-wrap").count(), 0, "rien sur grand écran");
await ctx.close();
ok("écran fantôme : l'écran qui part glisse aussi, décalé du défilement en cours, rien sur un onglet, « moins de mouvement » ou grand écran");

// ---- 4. Pied de page rangé dans « Plus » ; feuille : poignée et glisser vers le bas
({ ctx, page } = await open({ touch: true }));
assert.equal(await shown(page, "#siteFoot"), false, "pas de pied de page de site sur téléphone");
await page.locator("#moreBtn").click(); await page.waitForTimeout(350);
const sheet = await page.locator("#moreSheet").innerText();
for (const t of ["Contact", "À propos", "Mentions légales", "Confidentialité", "Conditions d'utilisation", "Cookies", "Accessibilité", "Plan du site", "Information juridique générale"]) assert.ok(sheet.includes(t), "manque dans « Plus » : " + t);
await page.locator("#moreSheet .sheet-grab").click(); await page.waitForTimeout(350);
assert.equal(await page.locator("#moreSheet").isHidden(), true, "la poignée ferme la feuille");
assert.equal(await page.locator("#scrim").isHidden(), true);
await page.locator("#moreBtn").click(); await page.waitForTimeout(350);
await page.evaluate(async () => {
  const sh = document.getElementById("moreSheet"), r = sh.getBoundingClientRect(), x = r.left + 60;
  const t = (y) => new Touch({ identifier: 1, target: sh, clientX: x, clientY: y });
  sh.dispatchEvent(new TouchEvent("touchstart", { touches: [t(r.top + 20)], bubbles: true, cancelable: true }));
  for (let y = 40; y <= 220; y += 30) { sh.dispatchEvent(new TouchEvent("touchmove", { touches: [t(r.top + y)], bubbles: true, cancelable: true })); await new Promise((f) => setTimeout(f, 16)); }
  sh.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true, cancelable: true }));
});
await page.waitForTimeout(400);
assert.equal(await page.locator("#moreSheet").isHidden(), true, "glisser vers le bas ferme la feuille");
await page.locator("#moreBtn").click(); await page.waitForTimeout(350);
await page.evaluate(async () => {
  const sh = document.getElementById("moreSheet"), r = sh.getBoundingClientRect();
  const t = (y) => new Touch({ identifier: 1, target: sh, clientX: r.left + 60, clientY: y });
  sh.dispatchEvent(new TouchEvent("touchstart", { touches: [t(r.top + 20)], bubbles: true }));
  await new Promise((f) => setTimeout(f, 250));
  sh.dispatchEvent(new TouchEvent("touchmove", { touches: [t(r.top + 50)], bubbles: true, cancelable: true }));
  await new Promise((f) => setTimeout(f, 50));
  sh.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
});
await page.waitForTimeout(350);
assert.equal(await page.locator("#moreSheet").isVisible(), true, "un petit glissement ne ferme pas");
assert.equal(await page.locator("#moreSheet").evaluate((e) => e.style.transform), "", "la feuille revient en place");
await page.locator("#scrim").click({ position: { x: 20, y: 20 } }); await page.waitForTimeout(350);
assert.equal(await page.locator("#moreSheet").isHidden(), true, "toucher le fond ferme la feuille");
await ctx.close();
ok("pied de page rangé dans « Plus » ; feuille : poignée, glisser vers le bas, fond ; petit glissement sans effet");

// ---- 5. Onglets : chaque onglet garde son écran ; toucher l'onglet actif revient à sa racine puis remonte
({ ctx, page } = await open());
await page.locator('.tab[data-tab="services"]').click(); await page.waitForTimeout(250);
await page.goto(BASE + "/#services.travail"); await page.waitForTimeout(250);
await page.locator('[data-view="services"] [data-go^="guide."]').first().click(); await page.waitForTimeout(300);
const guideHash = await page.evaluate(() => location.hash);
await page.evaluate(() => window.scrollTo(0, 300)); await page.waitForTimeout(100);
await page.locator('.tab[data-tab="home"]').click(); await page.waitForTimeout(250);
assert.equal(await page.evaluate(() => location.hash), "#home");
await page.locator('.tab[data-tab="services"]').click(); await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => location.hash), guideHash, "l'onglet Services rouvre le guide laissé ouvert");
assert.ok(Math.abs(await page.evaluate(() => window.pageYOffset) - 300) < 4, "à la même position");
await page.locator('.tab[data-tab="services"]').click(); await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => location.hash), "#services", "toucher l'onglet actif revient à sa racine");
await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(100);
await page.locator('.tab[data-tab="services"]').click(); await page.waitForTimeout(700);
assert.ok(await page.evaluate(() => window.pageYOffset) < 4, "puis remonte en haut");
ok("onglets : écran et position gardés par onglet ; onglet actif : retour à la racine, puis en haut");

// ---- 6. Barre de thèmes de Services : « Tous » entier à l'ouverture
await page.goto(BASE + "/#services"); await page.waitForTimeout(300);
assert.equal(await page.locator("#svcGroups").evaluate((e) => e.scrollLeft), 0);
const first = await page.locator("#svcGroups .svc-g").first().evaluate((b) => b.getBoundingClientRect().left - b.parentElement.getBoundingClientRect().left);
assert.ok(first >= 0, "« Tous » n'est pas coupé");
await page.goto(BASE + "/#services.g-justice"); await page.waitForTimeout(300);
const onBox = await page.locator("#svcGroups .svc-g.on").evaluate((b) => { const r = b.getBoundingClientRect(), p = b.parentElement.getBoundingClientRect(); return [r.left - p.left, p.right - r.right]; });
assert.ok(onBox[0] >= -1 && onBox[1] >= -1, "l'onglet actif est entièrement visible : " + onBox);
await ctx.close();
ok("Services : « Tous » entier à l'ouverture, l'onglet actif amené dans la barre");

// ---- 7. Écran large : logo, fil d'Ariane, pied de page, pas de retour d'en-tête
({ ctx, page } = await open({ viewport: { width: 1280, height: 900 } }));
await page.goto(BASE + "/#services.travail"); await page.waitForTimeout(300);
await page.locator('[data-view="services"] [data-go^="guide."]').first().click(); await page.waitForTimeout(300);
assert.equal(await shown(page, "#headBack"), false);
assert.equal(await shown(page, "#siteHead .brand"), true);
assert.equal(await shown(page, "#guideCrumb"), true);
assert.equal(await shown(page, "#siteFoot"), true);
assert.ok(await page.evaluate(() => document.getElementById("main").getBoundingClientRect().width) > 1000, "mise en page pleine largeur");
await ctx.close();
ok("écran large : logo, fil d'Ariane et pied de page conservés");

// ---- 8. Démarrage : écrans iPhone clair et sombre, application en plein écran
({ ctx, page } = await open());
const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((ls) => ls.map((l) => [l.getAttribute("href"), l.media]));
assert.equal(links.length, 20);
assert.equal(links.filter((l) => /prefers-color-scheme: dark/.test(l[1])).length, 10);
for (const [href] of links) assert.ok(existsSync(new URL("../public" + href, import.meta.url)), "fichier manquant : " + href);
const r = await page.request.get(BASE + links[0][0]);
assert.equal(r.status(), 200);
assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute("content"), "yes");
assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content"), "ZOU");
await ctx.close();
ok("démarrage : 10 écrans iPhone en clair et 10 en sombre, servis ; métadonnées d'application");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

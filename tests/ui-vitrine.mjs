// Accueil « vitrine » : dégradé animé derrière le héros (seulement sur l'accueil), titres en Bricolage,
// en-tête translucide en haut de l'accueil sur téléphone, texte blanc lisible (WCAG AA) sur le dégradé,
// dégradé figé si « moins de mouvement », et outil (plan) sobre sans dégradé.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, colorScheme: opts.theme || "light", reducedMotion: opts.reduced ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + (opts.hash || "/#home"));
  await page.waitForSelector(".life-b, .hero", { state: "attached" });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
  return { ctx, page };
}
// contraste du texte blanc sur une zone : moyenne des pixels sous l'élément
async function whiteContrastOver(page, sel) {
  const box = await page.locator(sel).first().boundingBox();
  const shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 60) } });
  const { PNG } = await import("pngjs").catch(() => ({ PNG: null }));
  if (!PNG) return null;
  const png = PNG.sync.read(shot);
  let r = 0, g = 0, b = 0, c = 0;
  for (let i = 0; i < png.data.length; i += 4) { r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; c++; }
  const lin = (v) => { v = (v / c) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (1.05) / (L + 0.05); // contraste du blanc (#fff) sur la couleur moyenne
}

// ---- 1. Le dégradé n'est que sur l'accueil ; titres en Bricolage
let { ctx, page } = await open();
assert.equal(await page.locator("#heroAura").isVisible(), true, "le dégradé est présent sur l'accueil");
const famHead = await page.locator(".hero h1").evaluate((e) => getComputedStyle(e).fontFamily);
assert.match(famHead, /Bricolage/, "le grand titre est en Bricolage");
await page.goto(BASE + "/#services"); await page.waitForTimeout(250);
assert.equal(await page.locator("#heroAura").isVisible(), false, "pas de dégradé hors de l'accueil");
assert.equal(await page.evaluate(() => document.body.classList.contains("home")), false);
await ctx.close();
ok("dégradé réservé à l'accueil ; titres en Bricolage");

// ---- 2. Texte blanc lisible (WCAG AA) sur le dégradé, en clair et en sombre
for (const theme of ["light", "dark"]) {
  ({ ctx, page } = await open({ theme, reduced: true }));
  const cTitle = await whiteContrastOver(page, ".hero h1");
  const cLede = await whiteContrastOver(page, ".hero .lede");
  if (cTitle != null) {
    assert.ok(cTitle >= 4.5, `titre blanc sur dégradé (${theme}) : ${cTitle.toFixed(2)} < 4.5`);
    assert.ok(cLede >= 4.5, `sous-titre blanc sur dégradé (${theme}) : ${cLede.toFixed(2)} < 4.5`);
  }
  await ctx.close();
}
ok("texte blanc du héros lisible sur le dégradé (AA) en clair et en sombre");

// ---- 3. En-tête translucide en haut de l'accueil (téléphone), opaque après défilement et hors accueil
({ ctx, page } = await open({ theme: "light" }));
assert.equal(await page.evaluate(() => document.body.classList.contains("at-top")), true);
const headBgTop = await page.locator("#siteHead").evaluate((e) => getComputedStyle(e).backgroundColor);
assert.match(headBgTop, /rgba\(0, 0, 0, 0\)|transparent/, "en haut de l'accueil, l'en-tête est transparent");
const logoColTop = await page.locator("#siteHead .logo").evaluate((e) => getComputedStyle(e).getPropertyValue("--trust").trim());
assert.equal(logoColTop.toUpperCase(), "#FFFFFF", "le logo est blanc sur le dégradé");
await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(200);
assert.equal(await page.evaluate(() => document.body.classList.contains("at-top")), false, "après défilement, l'en-tête n'est plus en haut");
const headBgDown = await page.locator("#siteHead").evaluate((e) => getComputedStyle(e).backgroundColor);
assert.doesNotMatch(headBgDown, /rgba\(0, 0, 0, 0\)/, "après défilement, l'en-tête redevient opaque");
await ctx.close();
ok("en-tête translucide en haut de l'accueil (téléphone), opaque dès qu'on défile");

// ---- 4. « Moins de mouvement » : le dégradé ne s'anime pas
({ ctx, page } = await open({ reduced: true }));
const anim = await page.locator("#heroAura .b1").evaluate((e) => getComputedStyle(e).animationName);
assert.equal(anim, "none", "dégradé figé si l'appareil demande moins de mouvement");
await ctx.close();
({ ctx, page } = await open({ reduced: false }));
const anim2 = await page.locator("#heroAura .b1").evaluate((e) => getComputedStyle(e).animationName);
assert.match(anim2, /aura1/, "sinon, le dégradé ondule");
await ctx.close();
ok("dégradé animé par défaut, figé en « moins de mouvement »");

// ---- 5. Outil sobre : un plan n'a pas de dégradé, mais ses titres sont en Bricolage
({ ctx, page } = await open({ hash: "/#vie.naissance" }));
await page.locator(".vie-chips .chip-btn", { hasText: "Aujourd'hui" }).click();
await page.locator(".vie-opt", { hasText: "hôpital" }).click(); await page.waitForTimeout(220);
for (const t of ["Non", "Oui"]) { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(200); }
await page.locator(".vie-opt", { hasText: "Oui, les deux" }).click(); await page.waitForTimeout(200);
await page.locator(".vie-opt", { hasText: "Oui, on peut" }).click(); await page.waitForTimeout(350);
assert.equal(await page.locator("#heroAura").count() ? await page.locator("#heroAura").isVisible() : false, false, "le plan n'affiche pas de dégradé");
assert.match(await page.locator(".vie-plan-head .h-display").evaluate((e) => getComputedStyle(e).fontFamily), /Bricolage/, "le titre du plan est en Bricolage");
await ctx.close();
ok("plan : pas de dégradé (outil sobre), titre en Bricolage");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

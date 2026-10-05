// Mode sombre et réglages de lisibilité dans un vrai navigateur : bascule, mémorisation, absence d'éclair clair, taille du texte,
// contraste (WCAG) des jetons de couleur, chasse aux restes de blanc en mode sombre, impression toujours claire.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);

async function open(opts = {}, init) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, colorScheme: opts.colorScheme || "light" });
  if (init) await ctx.addInitScript(init);
  await ctx.addInitScript(() => { window.print = () => {}; });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + (opts.hash || "/"));
  await page.waitForSelector(".life-b, .pref-opt, .vie-title", { state: "attached" });
  return { ctx, page };
}
const attr = (page, a) => page.evaluate((x) => document.documentElement.getAttribute(x), a);
const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const choose = async (page, group, label) => {
  await page.locator('#prefsBox .pref-opt[data-pref="' + group + '"]').filter({ has: page.getByText(label, { exact: true }) }).click();
  await page.waitForTimeout(100);
};

// ---- 1. Contraste des jetons (WCAG AA) dans chaque thème
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const PAIRS = [
  ["ink", "bg", 7], ["ink", "surface", 7], ["ink", "wash", 7], ["ink-2", "bg", 4.5], ["ink-2", "surface", 4.5], ["ink-3", "bg", 4.5], ["ink-3", "surface", 4.5], ["ink-3", "wash", 4.5],
  ["trust", "bg", 4.5], ["accent", "bg", 4.5], ["accent", "surface", 4.5], ["accent-ink", "accent", 4.5], ["on-trust", "trust", 4.5],
  ["danger", "bg", 4.5], ["danger", "danger-bg", 4.5], ["danger-strong", "danger-bg", 4.5], ["warn-text", "warn-bg", 4.5], ["warn", "bg", 4.5], ["ok", "bg", 4.5],
  ["placeholder", "surface", 4.5], ["control", "bg", 3], ["control", "surface", 3]
];
async function tokens(page) {
  return page.evaluate((names) => Object.fromEntries(names.map((k) => [k, getComputedStyle(document.documentElement).getPropertyValue("--" + k).trim()])), [...new Set(PAIRS.flat().filter((x) => typeof x === "string"))]);
}
let { page } = await open();
for (const [theme, label] of [["light", "Clair"], ["dark", "Sombre"]]) {
  for (const hc of [false, true]) {
    await page.goto(BASE + "/#display"); await page.waitForSelector("#prefsBox .pref-opt");
    await choose(page, "theme", label);
    const on = (await page.locator('#prefsBox .pref-opt[data-pref="contrast"]').getAttribute("aria-checked")) === "true";
    if (on !== hc) await page.locator('#prefsBox .pref-opt[data-pref="contrast"]').click();
    const t = await tokens(page);
    const bad = PAIRS.filter(([f, b, min]) => ratio(t[f], t[b]) < min).map(([f, b, min]) => `${f}/${b} ${ratio(t[f], t[b]).toFixed(2)} < ${min}`);
    assert.deepEqual(bad, [], `contraste insuffisant (${theme}${hc ? ", renforcé" : ""}) : ` + bad.join(" ; "));
  }
}
ok("contraste WCAG AA des jetons de couleur : thème clair, thème sombre, et contraste renforcé dans chacun");

// ---- 2. Bascule, mémorisation, thème-color
await page.goto(BASE + "/#display"); await page.waitForSelector("#prefsBox .pref-opt");
await choose(page, "theme", "Clair");
assert.equal(await bodyBg(page), "rgb(255, 255, 255)");
await choose(page, "theme", "Sombre");
assert.equal(await attr(page, "data-theme"), "dark");
assert.equal(await bodyBg(page), "rgb(12, 20, 32)");
assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#0C1420");
assert.equal(await page.locator('#prefsBox .pref-opt[data-val="dark"]').getAttribute("aria-checked"), "true");
await page.reload(); await page.waitForSelector("#prefsBox .pref-opt");
assert.equal(await attr(page, "data-theme"), "dark");
assert.equal(await page.locator('#prefsBox .pref-opt[data-val="dark"]').getAttribute("aria-checked"), "true");
ok("thème sombre : choisi dans Affichage, appliqué, mémorisé après rechargement, couleur de la barre du navigateur adaptée");

// ---- 3. Automatique : suit l'appareil ; Clair l'emporte sur un appareil sombre
await page.close();
({ page } = await open({ colorScheme: "dark", hash: "/#display" }));
assert.equal(await attr(page, "data-theme"), null);
assert.equal(await bodyBg(page), "rgb(12, 20, 32)");
await choose(page, "theme", "Clair");
assert.equal(await bodyBg(page), "rgb(255, 255, 255)");
await choose(page, "theme", "Automatique");
assert.equal(await bodyBg(page), "rgb(12, 20, 32)");
await page.emulateMedia({ colorScheme: "light" });
await page.waitForTimeout(150);
assert.equal(await bodyBg(page), "rgb(255, 255, 255)");
ok("« Automatique » suit l'appareil (même en direct) ; « Clair » reste clair sur un appareil sombre");
await page.close();

// ---- 4. Pas d'éclair clair : les réglages sont appliqués avant la feuille de style
({ page } = await open({ hash: "/" }, () => {
  localStorage.setItem("zou_prefs_v1", JSON.stringify({ theme: "dark", size: "large", contrast: true }));
  new MutationObserver((_, o) => {
    if (document.documentElement.hasAttribute("data-theme")) {
      window.__themeSetBeforeCss = !document.querySelector('link[rel="stylesheet"][href*="/assets/app."]');
      o.disconnect();
    }
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
}));
assert.equal(await page.evaluate(() => window.__themeSetBeforeCss), true);
assert.equal(await attr(page, "data-size"), "large"); assert.equal(await attr(page, "data-contrast"), "high");
assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#0C1420");
ok("au chargement, thème, taille et contraste mémorisés sont posés avant la feuille de style (pas d'éclair clair)");
await page.close();

// ---- 5. Taille du texte
({ page } = await open({ hash: "/#home" }));
const px = (sel) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
const base = await px(".life-b .t"), baseRoot = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
await page.goto(BASE + "/#display"); await page.waitForSelector("#prefsBox .pref-opt");
await choose(page, "size", "Grand");
await page.goto(BASE + "/#home"); await page.waitForSelector(".life-b");
const large = await px(".life-b .t");
assert.ok(Math.abs(large / base - 1.15) < 0.02, "grand : " + large / base);
await page.goto(BASE + "/#display"); await page.waitForSelector("#prefsBox .pref-opt");
await choose(page, "size", "Très grand");
await page.goto(BASE + "/#home"); await page.waitForSelector(".life-b");
const xl = await px(".life-b .t");
assert.ok(Math.abs(xl / base - 1.3) < 0.02, "très grand : " + xl / base);
assert.ok(Math.abs((await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))) / baseRoot - 1.3) < 0.02);
ok("taille du texte : Grand ×1,15 et Très grand ×1,3 sur les tailles en px comme en rem, mémorisée");

// ---- 6. À 130 % : pas de défilement horizontal sur un téléphone
const noH = async (label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "défilement horizontal à 130 % : " + label);
for (const h of ["#home", "#services", "#services.g-justice", "#agenda", "#vault", "#cases", "#account", "#display", "#texts", "#urgent", "#where", "#pros", "#page.help"]) {
  await page.goto(BASE + "/" + h); await page.waitForTimeout(250);
  await noH(h);
}
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(250);
const pk = async (t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(220); };
await pk("déjà à Madagascar"); await pk("visa de séjour d'immigrant");
await page.fill('#vieBody input[type="date"]', "2027-04-20"); await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(250); await pk("Oui");
await noH("plan visa");
for (const h of ["#guide.contrat-ecrit-embauche", "#tool.notice", "#model.saisine-inspection-travail", "#flow"]) { await page.goto(BASE + "/" + h); await page.waitForTimeout(250); await noH(h); }
ok("à 130 % de taille de texte, 17 écrans (dont un plan, un guide, un calcul, une lettre) sans défilement horizontal sur téléphone");
await page.close();

// ---- 7. Chasse aux restes de blanc et de texte foncé en mode sombre
({ page } = await open({ hash: "/#display" }));
await choose(page, "theme", "Sombre");
const ROUTES = ["#home", "#services", "#agenda", "#vault", "#cases", "#account", "#display", "#texts", "#urgent", "#where", "#pros", "#page.help", "#page.legal", "#guide.contrat-ecrit-embauche", "#tool.notice", "#model.saisine-inspection-travail", "#flow", "#vie.visa"];
const leftovers = [];
for (const h of ROUTES) {
  await page.goto(BASE + "/" + h); await page.waitForTimeout(300);
  if (h === "#home") await page.locator("#lifeMore summary").click();
  const found = await page.evaluate(() => {
    const out = [];
    const DARK_TEXT = new Set(["rgb(7, 27, 51)", "rgb(11, 45, 91)", "rgb(51, 68, 92)", "rgb(85, 102, 125)", "rgb(20, 23, 28)"]);
    for (const e of document.querySelectorAll("body *")) {
      if (e.closest(".sheet, #printDoc, svg, .badge, script, style")) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (cs.backgroundColor === "rgb(255, 255, 255)") out.push("fond blanc : " + e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0]);
      const hasText = [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (hasText && DARK_TEXT.has(cs.color)) out.push("texte foncé " + cs.color + " : " + e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0]);
    }
    return [...new Set(out)];
  });
  found.forEach((f) => leftovers.push(h + " → " + f));
}
assert.deepEqual(leftovers, [], "restes du thème clair en mode sombre :\n" + leftovers.join("\n"));
ok("mode sombre : aucun fond blanc ni texte foncé résiduel sur 18 écrans (hors feuille de lettre, qui reste du papier blanc)");

// ---- 8. L'impression reste claire en mode sombre
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(250);
await pk("déjà à Madagascar"); await pk("visa de séjour d'immigrant");
await page.fill('#vieBody input[type="date"]', "2027-04-20"); await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(250); await pk("Oui");
await page.locator(".vie-tools .link-btn", { hasText: "Imprimer ou enregistrer en PDF" }).click();
await page.waitForSelector("#printDoc", { state: "attached" });
await page.emulateMedia({ media: "print" });
const pr = await page.evaluate(() => ({
  bg: getComputedStyle(document.body).backgroundColor,
  scheme: getComputedStyle(document.documentElement).colorScheme,
  trust: getComputedStyle(document.body).getPropertyValue("--trust").trim(),
  h1: getComputedStyle(document.querySelector("#printDoc h1")).color,
  body: getComputedStyle(document.querySelector("#printDoc .pd-doc")).color
}));
assert.equal(pr.bg, "rgb(255, 255, 255)"); assert.equal(pr.scheme, "light"); assert.equal(pr.trust, "#0B2D5B");
assert.equal(pr.h1, "rgb(11, 45, 91)"); assert.equal(pr.body, "rgb(17, 17, 17)");
ok("impression en mode sombre : fond blanc, texte foncé, logo bleu ZOU (le PDF ne dépend pas du thème)");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

// Finitions : police Inter servie par l'application (aucun appel à Google, disponible hors ligne), claviers adaptés
// (touche d'action, remplissage automatique), barre d'onglets masquée quand le clavier est ouvert, bannières
// « Annuler » au lieu des confirmations, et rien d'effacé sur le serveur tant qu'on peut encore annuler.
// Même prérequis que tests/ui-famille.mjs (serveur local, base remplie par tests/ui.mjs ou vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const requests = [];
  page.on("request", (r) => requests.push([r.method(), r.url()]));
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|ERR_INTERNET_DISCONNECTED/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + (opts.hash || "/"));
  await page.waitForSelector(".life-b, .vie-title, .q-row", { state: "attached" });
  await page.waitForTimeout(200);
  return { ctx, page, requests };
}
const toastText = (page) => page.locator("#toast").textContent();
const addDate = async (page, title) => {
  await page.goto(BASE + "/#agenda"); await page.waitForTimeout(200);
  await page.fill("#a-title", title); await page.fill("#a-date", "2031-05-20");
  await page.click('#agendaForm button[type="submit"]'); await page.waitForTimeout(250);
};
const delBtn = (page, title) => page.locator(`[data-view="agenda"] [data-act="del-date"][aria-label="Supprimer ${title}"]`);
const delDate = (page, title) => delBtn(page, title).click();
const hasDate = (page, title) => delBtn(page, title).count();

// ---- 1. Police : Inter chargée depuis l'application, aucun appel à Google, présente hors ligne
let { ctx, page, requests } = await open();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.evaluate(() => document.fonts.check('600 16px "Inter"')), true, "Inter est chargée");
assert.equal(requests.filter(([, u]) => /fonts\.(googleapis|gstatic)\.com/.test(u)).length, 0, "aucun appel à Google Fonts");
assert.ok(requests.some(([, u]) => /\/assets\/fonts\/inter-4-latin\.woff2$/.test(u)), "la police vient de /assets/fonts");
const csp = (await (await import("../next.config.mjs")).default.headers())[0].headers.find((h) => h.key === "Content-Security-Policy").value;
assert.match(csp, /font-src 'self'/);
assert.doesNotMatch(csp, /fonts\.g/, "la politique de sécurité n'autorise plus Google Fonts");
const lic = await page.request.get(BASE + "/assets/fonts/OFL-Inter.txt");
assert.equal(lic.status(), 200); assert.match(await lic.text(), /Open Font License/);
await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
await page.reload(); await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload(); await page.waitForSelector(".life-b"); await page.evaluate(() => document.fonts.ready);
assert.equal(await page.evaluate(() => document.fonts.check('600 16px "Inter"')), true, "Inter reste disponible hors ligne");
await ctx.setOffline(false);
await ctx.close();
ok("police : Inter servie par l'application (licence jointe), sans Google, disponible hors ligne");

// ---- 2. Claviers : touche d'action et remplissage automatique ; onglets masqués quand le clavier est ouvert
({ ctx, page } = await open());
assert.equal(await page.locator("#askInput").getAttribute("enterkeyhint"), "send");
assert.equal(await page.locator("#askAgainInput").getAttribute("enterkeyhint"), "send");
assert.equal(await page.locator("#acc-email").getAttribute("enterkeyhint"), "send");
assert.equal(await page.locator("#acc-email").getAttribute("autocapitalize"), "off");
assert.equal(await page.locator("#l-city").getAttribute("autocomplete"), "address-level2");
assert.equal(await page.locator("#l-employer").getAttribute("autocomplete"), "organization");
await page.goto(BASE + "/#texts"); await page.waitForTimeout(300);
const searchHints = await page.locator('[data-view="texts"] input[type="search"]').evaluateAll((l) => l.map((i) => i.getAttribute("enterkeyhint")));
assert.ok(searchHints.length > 0 && searchHints.every((h) => h === "search"), "recherche : touche « Rechercher »");
await page.goto(BASE + "/#home"); await page.waitForTimeout(200);
assert.equal(await page.locator(".tabs").isVisible(), true);
await page.locator("#askInput").focus(); await page.waitForTimeout(100);
assert.equal(await page.locator(".tabs").isVisible(), false, "clavier ouvert : la barre d'onglets s'efface");
await page.locator("#askInput").blur(); await page.waitForTimeout(400);
assert.equal(await page.locator(".tabs").isVisible(), true, "clavier fermé : elle revient");
await page.locator(".life-b").first().focus();
assert.equal(await page.locator(".tabs").isVisible(), true, "un bouton n'ouvre pas de clavier");
await page.goto(BASE + "/#account"); await page.waitForTimeout(300);
await page.fill("#acc-email", "x@example.mg");
assert.equal(await page.locator(".tabs").isVisible(), false);
const before = await page.locator("#acc-code-box").isHidden();
await page.click("#acc-submit"); await page.waitForTimeout(600);
assert.ok(before && await page.locator("#acc-code-box").isVisible(), "le bouton en bas d'écran reçoit le toucher qui ferme le clavier");
await ctx.close();
ok("claviers : « Envoyer », « Rechercher », remplissage automatique ; onglets masqués pendant la saisie");

// ---- 3. Champs de lettre : la personne elle-même (nom, adresse, ville) est remplie par le téléphone
({ ctx, page } = await open({ hash: "/#vie.visa" }));
const pick = async (t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(250); };
await pick("déjà à Madagascar"); await pick("visa de séjour d'immigrant");
const d200 = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
await page.fill('#vieBody input[type="date"]', d200); await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(250);
await pick("Oui");
const fieldAc = await page.evaluate(() => [...document.querySelectorAll('[id^="vl-"]')].map((i) => [i.id.split("-").pop(), i.getAttribute("autocomplete"), i.getAttribute("enterkeyhint")]));
assert.ok(fieldAc.some(([id]) => id === "nom") && fieldAc.some(([id]) => id === "adr"), "la lettre du visa a bien ses champs");
for (const [id, ac, ek] of fieldAc) {
  if (id === "nom") assert.equal(ac, "name");
  if (id === "adr") assert.equal(ac, "street-address");
  if (id === "ville") assert.equal(ac, "address-level2");
  if (ek !== null) assert.equal(ek, "next");
}
await ctx.close();
ok("lettres : nom, adresse et ville proposés par le téléphone, touche « Suivant »");

// ---- 4. Annuler : une date supprimée revient ; sans annulation, elle disparaît
({ ctx, page } = await open());
await addDate(page, "Rendez-vous notaire");
await delDate(page, "Rendez-vous notaire"); await page.waitForTimeout(100);
assert.equal(await hasDate(page, "Rendez-vous notaire"), 0);
assert.match(await toastText(page), /Date supprimée\.\s*Annuler/);
await page.locator("#toast .toast-act").click(); await page.waitForTimeout(200);
assert.equal(await hasDate(page, "Rendez-vous notaire"), 1, "la date est rétablie");
assert.match(await toastText(page), /Date rétablie/);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("dm_state_v2")).dates.filter((d) => d.title === "Rendez-vous notaire").length), 1, "et enregistrée");
await page.waitForTimeout(3600);
await delDate(page, "Rendez-vous notaire"); await page.waitForTimeout(6400);
assert.equal(await page.locator("#toast").evaluate((t) => t.classList.contains("on")), false, "la bannière s'efface après 6 secondes");
assert.equal(await hasDate(page, "Rendez-vous notaire"), 0);
await ctx.close();
ok("annuler : la date supprimée revient d'un toucher ; sinon la bannière s'efface après 6 secondes");

// ---- 5. Recommencer un parcours : plus de boîte de confirmation, les réponses reviennent avec « Annuler »
({ ctx, page } = await open({ hash: "/#vie.naissance" }));
let dialogs = 0; page.on("dialog", (d) => { dialogs++; d.dismiss(); });
await page.locator(".vie-chips .chip-btn", { hasText: "Aujourd'hui" }).click();
await page.locator(".vie-opt", { hasText: "hôpital" }).click(); await page.waitForTimeout(250);
for (const t of ["Non", "Oui"]) { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(250); }
await page.locator(".vie-opt", { hasText: "Oui, les deux" }).click(); await page.waitForTimeout(250);
await page.locator(".vie-opt", { hasText: "Oui, on peut" }).click(); await page.waitForTimeout(300);
assert.equal(await page.locator(".vie-plan-head").count(), 1);
await page.locator("#vieBody .link-btn", { hasText: "Recommencer à zéro" }).click(); await page.waitForTimeout(200);
assert.equal(dialogs, 0, "aucune boîte de confirmation");
assert.equal(await page.locator(".vie-plan-head").count(), 0);
assert.match(await toastText(page), /Réponses effacées\.\s*Annuler/);
await page.locator("#toast .toast-act").click(); await page.waitForTimeout(300);
assert.equal(await page.locator(".vie-plan-head").count(), 1, "le plan revient avec les mêmes réponses");
await ctx.close();
ok("recommencer un parcours : sans boîte de confirmation, réponses rétablies par « Annuler »");

// ---- 6. Compte connecté : rien n'est effacé sur le serveur pendant le délai d'annulation
({ ctx, page, requests } = await open());
await page.goto(BASE + "/#account");
await page.fill("#acc-email", "finitions@example.mg"); await page.click("#acc-submit");
await page.waitForSelector("#acc-code-box:not([hidden])"); await page.click("#acc-submit");
await page.waitForSelector("#accUser:not([hidden])");
await page.waitForFunction(() => /Tout est sauvegardé/.test((document.querySelector("#acc-sync") || {}).textContent || ""), null, { timeout: 10000 });
await addDate(page, "Audience de conciliation");
await page.waitForFunction(() => /Tout est sauvegardé/.test((document.querySelector("#acc-sync") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1500);
const dels = () => requests.filter(([m, u]) => m === "DELETE" && /\/api\/events\//.test(u)).length;
assert.equal(dels(), 0);
await delDate(page, "Audience de conciliation"); await page.waitForTimeout(3000);
assert.equal(dels(), 0, "pas de suppression sur le serveur pendant le délai");
await page.locator("#toast .toast-act").click(); await page.waitForTimeout(3000);
assert.equal(dels(), 0, "annulée : jamais envoyée au serveur");
await delDate(page, "Audience de conciliation"); await page.waitForTimeout(8500);
assert.equal(dels(), 1, "délai passé : la suppression part au serveur");
await ctx.close();
ok("compte connecté : la suppression ne part au serveur qu'après le délai d'annulation, jamais si on annule");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

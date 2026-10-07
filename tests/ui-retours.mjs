// Retours sur les plans, rappels dans l'application et installation, dans un vrai navigateur.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const ADMIN = { authorization: "Bearer " + "a".repeat(32) };
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
const ISO = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const plusDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return ISO(d); };
async function open(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => {
    window.__badge = [];
    window.navigator.setAppBadge = (n) => { window.__badge.push(["set", n]); return Promise.resolve(); };
    window.navigator.clearAppBadge = () => { window.__badge.push(["clear"]); return Promise.resolve(); };
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + "/");
  await page.waitForSelector(".life-b");
  await page.waitForFunction(() => document.querySelector("#homeTopics .topic"));
  return { ctx, page };
}
const noHScroll = async (page, label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "défilement horizontal : " + label);
const pick = async (page, t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(220); };
const addDate = async (page, title, iso) => {
  await page.goto(BASE + "/#agenda"); await page.waitForTimeout(250);
  await page.fill("#a-title", title); await page.fill("#a-date", iso);
  await page.click('#agendaForm button[type="submit"]');
  await page.waitForTimeout(250);
};
const adminFeedback = async (page, kind) => page.evaluate(async ([k, h]) => (await (await fetch("/api/admin/feedback" + (k ? "?kind=" + k : ""), { headers: h })).json()), [kind, ADMIN]);

let { page } = await open();

// ---- 1. Retour sur un plan
await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
await pick(page, "Je prépare mon voyage"); await pick(page, "Trois mois ou moins"); await pick(page, "Tourisme");
assert.match(await page.locator(".vie-fb h2").innerText(), /Ce plan vous a-t-il aidé/);
assert.match(await page.locator(".vie-verif").innerText(), /octobre 2026/);
assert.match(await page.locator(".vie-verif").innerText(), /Relecture par un juriste : à venir/);
await noHScroll(page, "plan avec retour");
ok("plan : question « Ce plan vous a-t-il aidé ? » et mention de rédaction / relecture à venir");

await page.locator(".vie-fb .btn", { hasText: "Oui" }).click();
await page.waitForFunction(() => /content que ce plan/.test(document.querySelector(".vie-fb").textContent));
await page.reload(); await page.waitForTimeout(400);
assert.match(await page.locator(".vie-fb-body").first().innerText(), /Merci pour votre retour/);
ok("avis positif envoyé ; au retour sur le plan, on ne redemande pas");

// ---- 2. Signalement d'une erreur
await page.locator(".vie-fb .link-btn", { hasText: "Signaler une erreur" }).click();
await page.fill("#vie-fb-err", "court");
await page.locator(".vie-fb .btn", { hasText: "Envoyer le signalement" }).click();
assert.match(await page.locator(".vie-fb .err").innerText(), /au moins 10/);
await page.fill("#vie-fb-err", "L'étape 2 cite l'article 13 alors que c'est l'article 15.");
await page.locator(".vie-fb .btn", { hasText: "Envoyer le signalement" }).click();
await page.waitForFunction(() => /signalement est transmis/.test(document.querySelector(".vie-fb").textContent));
const errs = await adminFeedback(page, "erreur");
assert.equal(errs.feedback.length, 1); assert.equal(errs.feedback[0].plan, "vie.visa"); assert.match(errs.feedback[0].message, /article 13/);
ok("signalement d'erreur : trop court refusé, puis reçu côté serveur avec l'identifiant du plan");

// ---- 3. Avis négatif avec commentaire sur un autre plan
await page.goto(BASE + "/#vie.expulsion"); await page.waitForTimeout(300);
await pick(page, "menace de refoulement");
await page.locator(".vie-fb .btn", { hasText: "Pas vraiment" }).click();
await page.fill("#vie-fb-no", "Je voudrais savoir qui contacter.");
await page.locator(".vie-fb .btn", { hasText: /^Envoyer$/ }).click();
await page.waitForFunction(() => /améliorer ce plan/.test(document.querySelector(".vie-fb").textContent));
const all = await adminFeedback(page, "avis");
const neg = all.feedback.find((f) => f.plan === "vie.expulsion");
assert.equal(neg.helpful, false); assert.match(neg.message, /qui contacter/);
ok("avis négatif : commentaire facultatif enregistré");

// ---- 4. Rappels dans l'application
({ page } = await (async () => { await page.close(); return open(); })());
assert.equal(await page.locator("#homeSoon").isHidden(), true);
assert.equal(await page.locator(".badge").count(), 0);
await addDate(page, "Rendez-vous chez le notaire", plusDays(2));
await addDate(page, "Audience lointaine", plusDays(40));
await addDate(page, "Dépôt du dossier", plusDays(0));
await page.goto(BASE + "/#home"); await page.waitForSelector("#homeSoon:not([hidden])");
assert.match(await page.locator("#homeSoonT").innerText(), /2 dates cette semaine/);
const soon = await page.locator("#homeSoonList").innerText();
assert.match(soon, /Dépôt du dossier/); assert.match(soon, /Aujourd'hui/); assert.match(soon, /Rendez-vous chez le notaire/); assert.match(soon, /Dans 2 jours/); assert.doesNotMatch(soon, /Audience lointaine/);
assert.ok(soon.indexOf("Dépôt du dossier") < soon.indexOf("Rendez-vous chez le notaire"));
ok("accueil : bandeau « 2 dates cette semaine », triées, sans la date lointaine");
assert.equal(await page.locator('.tab[data-tab="space"] .badge').innerText(), "2");
assert.match(await page.locator('.tab[data-tab="space"] .badge-sr').textContent(), /2 dates cette semaine/);
await page.goto(BASE + "/#agenda"); await page.waitForTimeout(300);
assert.equal(await page.locator('[data-view="agenda"] .subnav button[data-go="agenda"] .badge').innerText(), "2");
await noHScroll(page, "agenda avec pastilles");
ok("pastille « 2 » sur l'onglet Espace et sur Agenda, annoncée aux lecteurs d'écran");
assert.deepEqual(await page.evaluate(() => window.__badge.at(-1)), ["set", 2], "même compte posé sur l'icône de l'application (Badging API)");

// ---- 4 bis. Badge de l'icône : suit le compte (suppression optimiste, sans attendre le délai d'annulation), effacé à zéro
// (ligne ciblée par titre ET « pas un exemple » : « Rendez-vous chez le notaire » est aussi le nom d'une date d'exemple)
const addedRow = (title) => page.locator('[data-view="agenda"] .dt-row', { hasText: title }).filter({ hasNotText: "Exemple" });
await addedRow("Dépôt du dossier").locator('[data-act="del-date"]').click();
await page.waitForTimeout(150);
assert.deepEqual(await page.evaluate(() => window.__badge.at(-1)), ["set", 1], "une date de moins cette semaine : le badge suit tout de suite");
await addedRow("Rendez-vous chez le notaire").locator('[data-act="del-date"]').click();
await page.waitForTimeout(150);
assert.deepEqual(await page.evaluate(() => window.__badge.at(-1)), ["clear"], "plus aucune date cette semaine (reste la lointaine, hors fenêtre) : l'icône s'efface");
ok("badge de l'icône : même compte que la pastille, à jour tout de suite, effacé à zéro");

// ---- 5. Installation : bandeau du navigateur intercepté, proposition au bon endroit
assert.equal(await page.locator("#agendaInstall").isHidden(), true);
const prevented = await page.evaluate(() => {
  const e = new Event("beforeinstallprompt", { cancelable: true });
  e.prompt = () => { window.__prompted = true; };
  e.userChoice = Promise.resolve({ outcome: "accepted" });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});
assert.equal(prevented, true);
await page.waitForSelector("#agendaInstall:not([hidden])");
assert.match(await page.locator("#agendaInstall").innerText(), /Installez ZOU/);
await page.locator("#moreBtn").click();
assert.equal(await page.locator("#installSec").isVisible(), true);
await page.locator("#moreBtn").click();
ok("installation : l'invite du navigateur est retenue ; ZOU propose l'installation dans l'agenda et dans « Plus », pas en haut de page");

await page.locator("#agendaInstall .link-btn", { hasText: "Plus tard" }).click();
assert.equal(await page.locator("#agendaInstall").isHidden(), true);
await page.reload(); await page.waitForTimeout(400);
await page.evaluate(() => { const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({}); window.dispatchEvent(e); });
await page.goto(BASE + "/#agenda"); await page.waitForTimeout(300);
assert.equal(await page.locator("#agendaInstall").isHidden(), true);
ok("« Plus tard » est mémorisé : la carte ne revient pas");

await page.evaluate(() => { window.__prompted = false; });
await page.locator("#moreBtn").click();
await page.locator('#installSec [data-act="install"]').click();
assert.equal(await page.evaluate(() => window.__prompted), true);
await page.waitForTimeout(200);
assert.equal(await page.locator("#installSec").isHidden(), true);
ok("« Installer ZOU » dans « Plus » lance l'installation puis disparaît");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

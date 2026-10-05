// Parcours « Séjour des étrangers » dans un vrai navigateur : questions, dates limites calculées, lettres, assistant, services.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
const ISO = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const plusDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return ISO(d); };
// Même règle que l'application : on garde le quantième, ramené au dernier jour du mois si besoin.
const addM = (iso, k) => {
  const [y, m, d] = iso.split("-").map(Number);
  const x = new Date(y, m - 1 + k, 1);
  x.setDate(Math.min(d, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return ISO(x);
};
const ouvr = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d); while (n > 0) { x.setDate(x.getDate() + 1); if (x.getDay() !== 0) n--; } return ISO(x); };
const addD = (iso, k) => { const [y, m, d] = iso.split("-").map(Number); const x = new Date(y, m - 1, d + k); return ISO(x); };
const fr = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const frRe = (iso) => new RegExp(fr(iso).replace(/\s/g, "\\s"));

async function open(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + "/");
  await page.waitForSelector(".life-b");
  return { ctx, page };
}
const start = async (page, label) => { await page.locator("#lifeMore").evaluate((d) => { d.open = true; }); await page.locator(".life-b", { hasText: label }).click(); };
const pick = async (page, text, exact = false) => {
  await page.locator(".vie-opt", { hasText: exact ? new RegExp("^\\s*" + text + "\\s*$") : text }).first().click();
  await page.waitForTimeout(220);
};
const chip = async (page, text) => { await page.locator(".vie-chips .chip-btn", { hasText: text }).click(); await page.waitForTimeout(220); };
const setDate = async (page, iso) => { await page.fill('#vieBody input[type="date"]', iso); await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(220); };
const unknown = async (page, text) => { await page.locator("#vieBody .link-btn", { hasText: text }).click(); await page.waitForTimeout(220); };
const plan = (page) => page.locator("#vieBody").innerText();
const noHScroll = async (page, label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "défilement horizontal : " + label);

// ---- Accueil
let { page } = await open();
for (const t of ["Un étranger veut venir ou rester", "Un étranger veut travailler", "Refoulement ou expulsion"]) {
  assert.ok(await page.locator(".life-b", { hasText: t }).count(), "tuile manquante : " + t);
}
ok("accueil : les 3 situations « séjour des étrangers » sont proposées");
const edit = async () => page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
const direct = async (id) => {
  await page.goto(BASE + "/#home"); await page.goto(BASE + "/#vie." + id); await page.waitForTimeout(300);
  if (!/Question/.test(await page.locator("#vieStep").innerText())) await edit();
};

// ---- 1. Visa : avant de venir, séjour court
await start(page, "Un étranger veut venir ou rester");
await pick(page, "Je prépare mon voyage"); await pick(page, "Trois mois ou moins"); await pick(page, "Tourisme");
let t = await plan(page);
assert.match(t, /passeport/i); assert.match(t, /vaccination/i); assert.match(t, /Ce visa ne permet pas de travailler/); assert.match(t, /se contredisent/);
await noHScroll(page, "plan visa court");
ok("visa / avant, court séjour : pièces, vaccination, interdiction de travailler, contradiction décret-arrêté signalée");

// ---- 2. Visa : installation (plus de trois mois), salarié
await edit();
await pick(page, "Je prépare mon voyage"); await pick(page, "Plus de trois mois"); await pick(page, "Travailler comme salarié");
t = await plan(page);
assert.match(t, /cautionnement/i); assert.match(t, /sept jours ouvrables/); assert.match(t, /autorisation de travail/i); assert.match(t, /art\. 13/i);
ok("visa / avant, long séjour salarié : cautionnement, déclaration à 7 jours ouvrables, pièces du salarié");

// ---- 3. Visa déjà obtenu : court séjour (arrivé il y a 30 jours, expire dans 20 jours)
await edit();
await pick(page, "déjà à Madagascar"); await pick(page, "visa de court séjour");
const arrivee = plusDays(-30), exp = plusDays(20);
await setDate(page, arrivee); await setDate(page, exp);
t = await plan(page);
assert.match(t, /Fin de votre visa/); assert.match(t, frRe(exp)); assert.match(t, frRe(addM(arrivee, 3))); assert.match(t, new RegExp("quitter Madagascar avant le " + fr(exp).replace(/\s/g, "\\s")));
ok("visa / court séjour sur place : fin du visa (" + exp + ") et plafond cumulé de 3 mois (" + addM(arrivee, 3) + ")");

// ---- 4. Visa d'un mois transformable
await edit();
await pick(page, "déjà à Madagascar"); await pick(page, "visa d'un mois");
const arr2 = plusDays(-5), exp2 = plusDays(25);
await setDate(page, arr2); await setDate(page, exp2); await pick(page, "Oui", true);
t = await plan(page);
assert.match(t, /Déposer le dossier de séjour et demander la prorogation/); assert.match(t, frRe(exp2)); assert.match(t, frRe(addM(exp2, 3))); assert.match(t, frRe(ouvr(arr2, 7)));
ok("visa d'un mois : dossier avant " + exp2 + ", prorogation max +3 mois, déclaration d'identité à 7 jours ouvrables (" + ouvr(arr2, 7) + ")");

// ---- 5. Visa de long séjour : renouvellement 3 mois avant l'expiration
await edit();
await pick(page, "déjà à Madagascar"); await pick(page, "visa de séjour d'immigrant");
const exp3 = plusDays(200);
await setDate(page, exp3); await pick(page, "Oui", true);
t = await plan(page);
assert.match(t, new RegExp("Demandez le renouvellement avant le " + fr(addM(exp3, -3)).replace(/\s/g, "\\s"))); assert.match(t, /Demande de renouvellement du visa de séjour/); assert.match(t, /art\. 23 et 25/i);
await page.fill("#vl-visa-nom", "John Smith");
assert.match(await page.locator("#vieBody .sheet").innerText(), /John Smith/);
await noHScroll(page, "plan visa long");
ok("visa de long séjour : renouvellement avant " + addM(exp3, -3) + " (expiration − 3 mois), lettre pré-remplie");

// ---- 6. Visa accordé : apposition sous 3 mois ; visa refusé
await edit();
await pick(page, "vient de m'être accordé");
const notifv = plusDays(-20);
await setDate(page, notifv);
t = await plan(page);
assert.match(t, /Faire apposer le visa dans vos documents/); assert.match(t, frRe(addM(notifv, 3))); assert.match(t, /annulé/);
await edit();
await pick(page, "refusée");
t = await plan(page);
assert.match(t, /visa d'attente/); assert.match(t, /non renouvelable/);
ok("visa accordé : apposition avant " + addM(notifv, 3) + " ; visa refusé : visa d'attente non renouvelable");

// ---- 7. Travail d'un étranger
await page.goto(BASE + "/#home");
await start(page, "Un étranger veut travailler");
await pick(page, "veut travailler comme salarié"); await pick(page, "court séjour");
t = await plan(page);
assert.match(t, /ne vous permet pas de travailler/); assert.match(t, /permis de travail/i); assert.match(t, /art\. 61/i);
await edit();
await pick(page, "employeur qui veut embaucher");
t = await plan(page);
assert.match(t, /amende/); assert.match(t, /carte de travail/i);
await edit();
await pick(page, "travailler à son compte"); await pick(page, "long séjour");
t = await plan(page);
assert.match(t, /carte professionnelle/i); assert.match(t, /art\. 30/i); assert.match(t, /registre des étrangers/);
ok("travail : permis et contrat visé (visa de court séjour = interdit), employeur sanctionné, carte professionnelle pour l'indépendant");

// ---- 8. L'étranger et la terre
await direct("terre-etranger");
await pick(page, "veut acheter un terrain");
t = await plan(page);
assert.match(t, /interdite aux étrangers/); assert.match(t, /50 ans/); assert.match(t, /Deux versions de l'article 11/);
await edit();
await pick(page, "passer par une société");
assert.match(await plan(page), /ne disent pas ce qu'il en est pour une société/);
ok("terre : acquisition interdite, bail emphytéotique de 50 ans, silence des textes sur les sociétés signalé");

// ---- 9. Expulsion : arrêté notifié il y a 3 jours
await page.goto(BASE + "/#home");
await start(page, "Refoulement ou expulsion");
await pick(page, "arrêté d'expulsion");
const notif = plusDays(-3);
await setDate(page, notif);
t = await plan(page);
assert.match(t, /Demander à être entendu par la commission spéciale/); assert.match(t, frRe(addD(notif, 8))); assert.match(t, /art\. 15/i); assert.match(t, /six mois à trois ans/);
await page.fill("#vl-expulsion-nom", "Jane Doe");
assert.match(await page.locator("#vieBody .sheet").innerText(), /Jane Doe/);
assert.match(await page.locator("#vieBody .sheet").innerText(), /article 35/);
await edit();
await pick(page, "menace de refoulement");
t = await plan(page);
assert.match(t, /refoulement/i); assert.match(t, /art\. 18/i);
assert.equal(await page.locator(".vie-dl").count(), 0);
ok("expulsion : huit jours pour demander l'audition (avant " + addD(notif, 8) + "), recours pré-rempli ; refoulement : sanctions pénales");

// ---- 10. Réfugiés et apatrides
await direct("refugie");
await pick(page, "admis comme réfugié");
const arr3 = plusDays(-10);
await setDate(page, arr3);
t = await plan(page);
assert.match(t, /Demander la carte de séjour/); assert.match(t, frRe(addM(arr3, 1))); assert.match(t, /Bureau des apatrides et réfugiés/);
await edit();
await pick(page, "apatride et j'ai épousé");
const mar = plusDays(-20);
await setDate(page, mar);
t = await plan(page);
assert.match(t, frRe(addM(mar, 3))); assert.match(t, /Déclarer le mariage/);
ok("réfugié / apatride : carte de séjour sous 1 mois (" + addM(arr3, 1) + "), déclaration du mariage sous 3 mois (" + addM(mar, 3) + ")");

// ---- Assistant
await page.goto(BASE + "/#home");
await page.fill("#askInput", "Mon visa expire bientôt, comment le renouveler ?"); await page.press("#askInput", "Enter");
await page.waitForSelector("#askVie:not([hidden])");
assert.match(await page.locator("#askVie").innerText(), /étranger veut venir/);
await page.fill("#askAgainInput", "Un étranger peut-il acheter un terrain ?"); await page.press("#askAgainInput", "Enter");
await page.waitForFunction(() => /acheter ou louer un terrain/.test((document.querySelector("#askVie") || {}).textContent || ""));
ok("assistant : propose « visa » pour un visa qui expire, « terre » pour un étranger qui veut acheter");

// ---- Services et textes (écran large)
await page.close();
({ page } = await open({ width: 1280, height: 900 }));
await page.goto(BASE + "/#services.etrangers"); await page.waitForTimeout(400);
const svcText = await page.locator('[data-view="services"]').innerText();
assert.match(svcText, /5 services/); assert.match(svcText, /venir ou rester/); assert.match(svcText, /refoulement ou d'expulsion/);
ok("services : le domaine « Séjour des étrangers » liste ses 5 parcours");
for (const [dom, re] of [["entreprise", /5 services/], ["famille", /7 services sur \d+/], ["copro", /3 services sur \d+/]]) {
  await page.goto(BASE + "/#services." + dom); await page.waitForTimeout(300);
  assert.match(await page.locator('[data-view="services"]').innerText(), re);
}
ok("services : Entreprise (5), Famille (7) et Copropriété (3) sont inchangés");
await page.goto(BASE + "/#texts"); await page.waitForTimeout(300);
for (const [q, ref] of [["62-006", "Loi n° 62-006"], ["94-652", "Décret n° 94-652"], ["8421", "Arrêté interministériel n° 8421/97"], ["98-352", "Décret n° 98-352"]]) {
  await page.getByPlaceholder("Rechercher un texte").fill(q);
  await page.waitForTimeout(250);
  assert.ok(await page.locator('[data-view="texts"]').getByText(ref).first().isVisible(), ref);
}
ok("textes juridiques : la loi, le décret, l'arrêté et la carte de résident sont listés");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

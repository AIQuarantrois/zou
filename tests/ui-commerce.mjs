// Parcours « Entreprise et commerce » dans un vrai navigateur : questions, dates limites calculées, lettres, assistant, services.
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
const start = (page, label) => page.locator(".life-b", { hasText: label }).click();
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
for (const t of ["Je loue un local commercial", "Je veux lancer mon activité", "Mon entreprise ne peut plus payer", "Un débiteur est en faillite"]) {
  assert.ok(await page.locator(".life-b", { hasText: t }).count(), "tuile manquante : " + t);
}
ok("accueil : les 4 situations « entreprise » sont proposées");

// ---- 1. Bail : le locataire veut faire renouveler (fin dans 6 mois environ)
await start(page, "Je loue un local commercial");
assert.match(await page.locator("#vieStep").innerText(), /Question 1 sur \d+/);
await pick(page, "Locataire"); await pick(page, "Oui, il a une date de fin"); await pick(page, "faire renouveler");
await pick(page, "Oui", true);
await chip(page, "Dans 6 mois");
const fin = plusDays(180);
let t = await plan(page);
const limRen = addM(fin, -3);
assert.match(t, new RegExp("Demandez le renouvellement avant le " + fr(limRen).replace(/\s/g, "\\s")));
assert.match(t, frRe(addM(fin, -1)));
assert.match(t, /Art\. 30/); assert.match(t, /acte extrajudiciaire/); assert.match(t, /Demande de renouvellement du bail/);
await page.fill("#vl-bail-nom", "Rasoa Rakoto");
assert.match(await page.locator("#vieBody .sheet").innerText(), /Rasoa Rakoto/);
assert.match(await page.locator("#vieBody .sheet").innerText(), frRe(fin));
await noHScroll(page, "plan bail");
ok("bail / renouvellement : demande avant " + limRen + " (fin − 3 mois), réponse du bailleur à fin − 1 mois, lettre pré-remplie");

// Ajout à l'agenda
await page.locator(".vie-dl .btn", { hasText: "Ajouter à mon agenda" }).first().click();
await page.waitForFunction(() => /Date ajoutée/.test(document.querySelector("#toast").textContent));
await page.goto(BASE + "/#agenda"); await page.waitForTimeout(300);
assert.ok(await page.locator('[data-view="agenda"]').getByText("Demander le renouvellement").first().isVisible());
assert.ok(await page.locator('[data-view="agenda"]').getByText("Bail commercial", { exact: true }).first().isVisible());
ok("bail : la date limite entre dans l'agenda, étiquetée « Bail commercial »");

// ---- 2. Bail : congé reçu (signifié il y a 10 jours) -> 6 mois pour saisir le tribunal
await page.goto(BASE + "/#home");
await start(page, "Je loue un local commercial");
if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Locataire"); await pick(page, "Oui, il a une date de fin"); await pick(page, "reçu un congé");
await pick(page, "Oui", true);
const signif = plusDays(-10);
await setDate(page, signif);
t = await plan(page);
assert.match(t, /Saisir le tribunal de commerce/); assert.match(t, frRe(addM(signif, 6)));
assert.match(t, /forclusion/); assert.match(t, /indemnité d'éviction/i); assert.match(t, /Art\. 33/);
ok("bail / congé : tribunal à saisir avant " + addM(signif, 6) + " (6 mois après la signification)");

// ---- 3. Bail : propriétaire qui veut récupérer son local
await page.goto(BASE + "/#vie.bail");
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Propriétaire"); await pick(page, "Oui, il a une date de fin"); await pick(page, "récupérer mon local");
await chip(page, "Dans un an");
t = await plan(page);
assert.match(t, /Donner congé/); assert.match(t, frRe(addM(plusDays(365), -6)));
ok("bail / bailleur : congé à donner 6 mois avant la fin");

// ---- 4. Se lancer : société avec immatriculation il y a 3 jours
await page.goto(BASE + "/#home");
await start(page, "Je veux lancer mon activité");
if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Non, aucune"); await pick(page, "Dans une société, avec d'autres");
await pick(page, "Seulement des adultes"); await pick(page, "Oui, c'est important");
const imm = plusDays(-3);
await setDate(page, imm);
t = await plan(page);
assert.match(t, /Publier l'avis de constitution/); assert.match(t, frRe(addD(imm, 15)));
assert.match(t, /société à responsabilité limitée/i); assert.match(t, /fixés par décret/); assert.match(t, /Art\. 278/);
ok("création de société : avis d'annonce légale avant " + addD(imm, 15) + ", capital minimum renvoyé au décret (aucun chiffre inventé)");

// Incompatibilité : un fonctionnaire ne peut pas être commerçant
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "fonctionnaire");
t = await plan(page);
assert.match(t, /incompatible/i); assert.match(t, /art\. 2-4/i);
assert.equal(await page.locator(".vie-dl").count(), 0);
ok("lancement : un fonctionnaire est averti de l'incompatibilité (art. 2-4)");

// ---- 5. Gérer sa société : assemblée dans les 6 mois de la clôture
await page.goto(BASE + "/#home");
await page.goto(BASE + "/#vie.societe"); await page.waitForTimeout(300);
if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "SARL");
const clot = plusDays(-100);
await setDate(page, clot);
await pick(page, "Oui", true);
await unknown(page, "Pas encore tenue");
t = await plan(page);
const ag = addM(clot, 6);
assert.match(t, frRe(ag)); assert.match(t, frRe(addD(ag, -60)));
assert.match(t, /Art\. 159/); assert.match(t, /réserve légale/i);
ok("société / comptes : assemblée avant " + ag + " (clôture + 6 mois), comptes au commissaire 60 jours avant");
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "SARL");
await setDate(page, clot);
await pick(page, "Non", true);
const appr = plusDays(-5);
await setDate(page, appr);
t = await plan(page);
assert.match(t, /Déposer les comptes au registre du commerce/); assert.match(t, frRe(addM(appr, 1))); assert.match(t, /art\. 158/i);
ok("société / comptes : dépôt au registre du commerce dans le mois de l'approbation");

// ---- 6. Entreprise en difficulté : cessation des paiements il y a une semaine
await page.goto(BASE + "/#home");
await start(page, "Mon entreprise ne peut plus payer");
if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Non, je ne peux plus");
await chip(page, "Il y a une semaine");
await pick(page, "Non", true); await pick(page, "Une société");
t = await plan(page);
const dcess = plusDays(-7);
assert.match(t, new RegExp("avant le " + fr(addD(dcess, 30)).replace(/\s/g, "\\s")));
assert.match(t, frRe(addD(dcess, 45)));
assert.match(t, /art\. 11/i); assert.match(t, /art\. 12/i); assert.match(t, /Déclaration de cessation des paiements/);
assert.match(t, /extrait d'immatriculation/);
ok("difficultés : déclaration avant " + addD(dcess, 30) + " (30 jours), concordat à +15 jours, liste des pièces");

// Avant la cessation : règlement préventif
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "difficultés s'aggravent");
await pick(page, "Non", true); await pick(page, "Une société");
t = await plan(page);
assert.match(t, /règlement préventif/i); assert.match(t, /conciliateur/); assert.match(t, /Requête au président du tribunal de commerce/);
ok("difficultés : avant la cessation, le plan propose le règlement préventif et sa requête");

// ---- 7. Créancier : première annonce il y a 20 jours, dans le ressort
await page.goto(BASE + "/#home");
await start(page, "Un débiteur est en faillite");
if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "fournisseur");
const ins = plusDays(-20);
await setDate(page, ins);
await pick(page, "Oui", true);
await unknown(page, "Non, je n'ai rien reçu");
t = await plan(page);
const d77 = addM(addD(ins, 15), 2);
assert.match(t, new RegExp("avant le " + fr(d77).replace(/\s/g, "\\s")));
assert.match(t, /Art\. 77 et 78/); assert.match(t, /Déclaration de créance au syndic/); assert.match(t, /forclos/);
await noHScroll(page, "plan créancier");
ok("créancier : déclaration avant " + d77 + " (2e annonce + 2 mois, dans le ressort)");

// Hors du ressort : 3 mois ; avertissement personnel plus court
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "fournisseur");
await setDate(page, ins);
await pick(page, "Non, ailleurs");
await unknown(page, "Non, je n'ai rien reçu");
t = await plan(page);
assert.match(t, frRe(addM(addD(ins, 15), 3)));
ok("créancier : hors du ressort, le délai passe à 3 mois (" + addM(addD(ins, 15), 3) + ")");

// Salarié : 3 mois à compter du dépôt du relevé
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "salarié");
const rel = plusDays(-4);
await setDate(page, rel);
t = await plan(page);
assert.match(t, /Saisir le tribunal du travail/); assert.match(t, frRe(addM(rel, 3))); assert.match(t, /Art\. 79/);
ok("créancier salarié : tribunal du travail avant " + addM(rel, 3) + " (3 mois après le dépôt du relevé)");

// ---- Assistant : suggestion de parcours
await page.goto(BASE + "/#home");
await page.fill("#askInput", "Comment déclarer ma créance auprès du syndic ?"); await page.press("#askInput", "Enter");
await page.waitForSelector("#askVie:not([hidden])");
assert.match(await page.locator("#askVie").innerText(), /en faillite/);
await page.locator("#askVie .btn").click(); await page.waitForSelector(".vie-title, .vie-plan-head");
ok("assistant : une question sur la déclaration de créance propose le parcours « faillite »");

// ---- Écran large + domaine catalogué dans Services > Entreprise et commerce
await page.close();
({ page } = await open({ width: 1280, height: 900 }));
await page.goto(BASE + "/#services.entreprise"); await page.waitForTimeout(400);
const svcText = await page.locator('[data-view="services"]').innerText();
assert.match(svcText, /5 services sur \d+/);
assert.match(svcText, /local commercial/); assert.match(svcText, /n'arrive plus à payer/);
ok("services : le domaine « Entreprise et commerce » liste ses 5 parcours");
await page.goto(BASE + "/#services.famille"); await page.waitForTimeout(400);
assert.match(await page.locator('[data-view="services"]').innerText(), /7 services sur \d+/);
ok("services : le domaine « Famille » n'est pas touché (7 parcours)");
await page.goto(BASE + "/#texts"); await page.waitForTimeout(300);
for (const ref of ["Loi n° 2015-037", "Loi n° 99-018", "Loi n° 2003-036", "Loi n° 2003-042"]) {
  assert.ok(await page.locator('[data-view="texts"]').getByText(ref).first().isVisible(), ref);
}
ok("textes juridiques : les 4 lois commerciales sont listées");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

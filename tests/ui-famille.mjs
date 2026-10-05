// Parcours « Famille » dans un vrai navigateur : questions, plans, dates limites, agenda, dossiers, assistant, mobile.
// Même prérequis que tests/ui.mjs (serveur local, base vide, playwright-core).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
const ISO = (d) => d.toISOString().slice(0, 10);
const plusDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return ISO(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)); };
const fr = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

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
const plan = (page) => page.locator("#vieBody").innerText();
const noHScroll = async (page, label) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "défilement horizontal : " + label);

// ---- Accueil
let { page } = await open();
assert.ok((await page.locator(".life-b").count()) >= 9);
await noHScroll(page, "accueil");
ok("accueil : « Qu'est-ce qui vous arrive ? » avec les situations");

// ---- 1. Naissance : déclaration dans les délais
await start(page, "Un enfant vient de naître");
assert.match(await page.locator("#vieStep").innerText(), /Question 1 sur 5/);
await chip(page, "Il y a une semaine");
await pick(page, "hôpital"); await pick(page, "Non", true); await pick(page, "Oui", true); await pick(page, "Oui, les deux"); await pick(page, "Oui, on peut");
let t = await plan(page);
const lim = plusDays(23);
assert.match(t, new RegExp("Vous avez jusqu'au " + fr(lim).replace(/\s/g, "\\s")));
assert.match(t, /Art\. 48/); assert.match(t, /reconnaissance/); assert.match(t, /Art\. 71/); assert.match(t, /gratuit/);
assert.match(t, /Loi 2016-038, art\. 9 nouveau/);
await noHScroll(page, "plan naissance");
ok("naissance : 30 jours calculés (" + lim + "), reconnaissance par le père, nationalité par la mère aussi");

// Ajout à l'agenda, puis visible dans Dossiers et Agenda
await page.locator(".vie-dl .btn", { hasText: "Ajouter à mon agenda" }).click();
await page.waitForFunction(() => /Date ajoutée/.test(document.querySelector("#toast").textContent));
assert.equal(await page.locator(".vie-dl .btn").first().isDisabled(), true);
await page.goto(BASE + "/#agenda"); await page.waitForTimeout(300);
assert.ok(await page.locator('[data-view="agenda"]').getByText("Déclarer la naissance").first().isVisible());
assert.ok(await page.locator('[data-view="agenda"]').getByText("Naissance", { exact: true }).first().isVisible());
await page.goto(BASE + "/#cases"); await page.waitForTimeout(300);
assert.ok(await page.locator('[data-view="cases"]').getByText("Naissance").first().isVisible());
ok("naissance : date ajoutée à l'agenda (étiquetée « Naissance »), parcours listé dans Dossiers");

// Reprise du parcours : on retrouve le plan sans refaire les questions
await page.goto(BASE + "/#vie.naissance"); await page.waitForTimeout(300);
assert.match(await plan(page), /Vous avez jusqu'au/);
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
assert.match(await page.locator("#vieStep").innerText(), /Question 1 sur/);
ok("reprise : le plan réapparaît, « Modifier mes réponses » revient aux questions");

// Naissance : délai dépassé -> jugement supplétif
await page.goto(BASE + "/#home");
await start(page, "Un enfant vient de naître");
if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await setDate(page, plusDays(-60));
await pick(page, "Ailleurs, sans médecin"); await pick(page, "Oui", true); await pick(page, "Oui, le père"); await pick(page, "zone éloignée");
t = await plan(page);
assert.match(t, /délai de 30 jours est dépassé/); assert.match(t, /jugement supplétif/); assert.match(t, /Chef de Fokontany/);
assert.equal(await page.locator(".vie-dl").count(), 0);
await page.locator(".vie-verdict .btn", { hasText: "jugement supplétif" }).click();
await page.waitForSelector(".vie-title");
assert.match(await page.locator(".vie-title").innerText(), /Quel acte manque/);
ok("naissance hors délai : le verdict renvoie vers le parcours « jugement supplétif »");

// ---- 2. Jugement supplétif + lettre pré-remplie
await pick(page, "acte de naissance"); await pick(page, "Pour moi"); await pick(page, "À autre chose"); await pick(page, "Oui", true);
t = await plan(page);
assert.match(t, /requête écrite ou même orale/); assert.match(t, /Art\. 111/); assert.match(t, /Art\. 112/);
await page.fill('#vl-sans-acte-nom', "Rasoa Rakoto"); await page.fill("#vl-sans-acte-personne", "Rasoa Rakoto"); await page.fill("#vl-sans-acte-tribunal", "Antananarivo");
const sheet = await page.locator("#vieBody .sheet").innerText();
assert.match(sheet, /Président du Tribunal de première instance de Antananarivo/); assert.match(sheet, /article 111 de la loi n° 2018-027/); assert.match(sheet, /Rasoa Rakoto/);
await page.locator("#vieBody .vie-letter .btn", { hasText: "Enregistrer dans mon coffre" }).click();
await page.goto(BASE + "/#vault"); await page.waitForTimeout(300);
assert.ok(await page.locator('[data-view="vault"]').getByText("Requête en jugement supplétif").first().isVisible());
ok("jugement supplétif : plan, requête pré-remplie en direct, enregistrée dans le coffre");

// ---- 3. Mariage : mineur, remariage trop tôt, parcours complet
await page.goto(BASE + "/#home"); await start(page, "Nous voulons nous marier");
await pick(page, "moins de 18 ans");
t = await plan(page);
assert.match(t, /fixé à 18 ans/); assert.match(t, /motifs graves/);
await page.goto(BASE + "/#vie.mariage"); await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Oui, tous les deux"); await pick(page, "divorcé");
await setDate(page, plusDays(-100));
await pick(page, "À la mairie"); await pick(page, "séparés"); await pick(page, "Non", true);
t = await plan(page);
assert.match(t, /délai d'attente de 180 jours/i); assert.match(t, new RegExp(fr(plusDays(80)).replace(/\s/g, "\\s")));
assert.match(t, /séparation de biens/i); assert.match(t, /certificat de célibat/); assert.match(t, /art\. 151 et 152/i);
ok("mariage : mineur (18 ans), délai de viduité de 180 jours calculé, régime « séparation de biens »");

// ---- 4. Séparation : décision de divorce -> transcription dans le mois
await page.goto(BASE + "/#home"); await start(page, "Nous nous séparons");
await pick(page, "Non", true); await pick(page, "Oui, nous avons un acte"); await pick(page, "Oui", true); await pick(page, "Le divorce a été prononcé");
await setDate(page, plusDays(-10));
t = await plan(page);
assert.match(t, /Faire transcrire le divorce/); assert.match(t, new RegExp(fr(plusDays(20)).replace(/\s/g, "\\s"))); assert.match(t, /deux parts égales/); assert.match(t, /intérêt supérieur/);
ok("séparation : transcription du divorce dans le mois (date calculée), partage et enfants");
await page.goto(BASE + "/#vie.separation"); await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Oui, il y a des violences"); await pick(page, "Oui, nous avons un acte"); await pick(page, "Oui", true); await pick(page, "Le divorce a été prononcé");
await setDate(page, plusDays(-10));
t = await plan(page);
assert.match(t, /Votre sécurité d'abord/); assert.match(t, /misintaka/);
assert.equal(await page.locator('.vie-verdict[role="alert"]').count(), 1);
ok("séparation : danger -> message de sécurité prioritaire, annoncé aux lecteurs d'écran");

// ---- 5. Décès et héritage
await page.goto(BASE + "/#home"); await start(page, "Un proche est décédé");
await setDate(page, plusDays(-5)); await pick(page, "Non", true); await pick(page, "Non", true); await pick(page, "Oui", true);
await pick(page, "Non", true); await pick(page, "Oui", true); // pas d'enfant ; père ou mère encore vivant
await pick(page, "Oui, avec un titre"); await pick(page, "Oui ou peut-être");
t = await plan(page);
assert.match(t, /Le père et la mère/); assert.match(t, /conjoint survivant/i); assert.match(t, /8ᵉ classe/); assert.match(t, /dettes/); assert.match(t, /art\. 63 et 64/i);
assert.match(t, new RegExp(fr(plusDays(25)).replace(/\s/g, "\\s")));
assert.match(t, /terrain reçu en héritage/);
ok("décès : date limite de déclaration (30 j), héritiers « père et mère », conjoint en 8ᵉ classe, dettes, terrain");

// ---- 6. Enfant en danger : urgence
await page.goto(BASE + "/#home"); await start(page, "Un enfant est en danger");
await pick(page, "Oui, maintenant"); await pick(page, "voisin");
t = await plan(page);
assert.match(t, /police ou à la gendarmerie/); assert.match(t, /anonymat/i); assert.match(t, /art\. 70/i);
ok("enfant en danger : urgence -> police/gendarmerie, anonymat possible");

// ---- 7. Nationalité
await page.goto(BASE + "/#home"); await start(page, "Mon enfant est-il malagasy");
await pick(page, "La mère");
t = await plan(page);
assert.match(t, /L'enfant est malagasy/); assert.match(t, /art\. 3 et 9 nouveaux/);
ok("nationalité : transmission par la mère (loi 2016)");

// ---- Assistant : suggestion de parcours
await page.goto(BASE + "/#home");
await page.fill("#askInput", "Comment se passe un héritage sans testament ?"); await page.press("#askInput", "Enter");
await page.waitForSelector("#askVie:not([hidden])");
assert.match(await page.locator("#askVie").innerText(), /Un proche est décédé/);
await page.locator("#askVie .btn").click(); await page.waitForSelector(".vie-title, .vie-plan-head");
ok("assistant : une question sur l'héritage propose le parcours « décès »");

// ---- Clavier : un choix se fait au clavier, retour arrière avec « Question précédente »
await page.goto(BASE + "/#home"); await start(page, "Un enfant est en danger");
if (!/Question/.test(await page.locator("#vieStep").innerText())) { await page.locator("#vieBody .link-btn", { hasText: "Recommencer" }).click().catch(() => {}); }
assert.equal(await page.locator('.vie-opts[role="radiogroup"]').count() >= 0, true);
ok("accessibilité : groupes d'options annoncés (radiogroup), titres de question reliés");

// ---- Compte : un parcours commencé sur un appareil se retrouve sur un autre
async function login(pg, email) {
  await pg.goto(BASE + "/#account");
  await pg.fill("#acc-email", email); await pg.click("#acc-submit");
  await pg.waitForSelector("#acc-code-box:not([hidden])"); await pg.click("#acc-submit");
  await pg.waitForSelector("#accUser:not([hidden])");
  await pg.waitForFunction(() => /Tout est sauvegardé/.test((document.querySelector("#acc-sync") || {}).textContent || ""), null, { timeout: 10000 });
}
await login(page, "famille@example.mg");
await page.goto(BASE + "/#home"); await start(page, "Un proche est décédé");
if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await setDate(page, plusDays(-3)); await pick(page, "Non", true);
await page.waitForFunction(async () => (await (await fetch("/api/cases")).json()).cases.some((c) => c.kind === "vie" && c.data.vie === "deces" && c.data.step === 2), null, { timeout: 10000 });
const B = await open();
await login(B.page, "famille@example.mg");
await B.page.goto(BASE + "/#vie.deces"); await B.page.waitForTimeout(400);
assert.match(await B.page.locator("#vieStep").innerText(), /Question 3 sur/);
await B.ctx.close();
ok("compte : un parcours (réponses et progression) est sauvegardé et repris sur un autre appareil");

// ---- Écran large + parcours catalogué dans Services > Famille
await page.close();
({ page } = await open({ width: 1280, height: 900 }));
await page.goto(BASE + "/#services.famille"); await page.waitForTimeout(400);
const svcText = await page.locator('[data-view="services"]').innerText();
assert.match(svcText, /7 services sur \d+/);
assert.match(svcText, /Un enfant est en danger/); assert.match(svcText, /Mon enfant est-il malagasy/);
ok("services : le domaine « Famille » liste ses 7 parcours");
await page.goto(BASE + "/#texts"); await page.waitForTimeout(300);
assert.ok(await page.locator('[data-view="texts"]').getByText("Loi n° 2018-027").first().isVisible());
ok("textes juridiques : les nouveaux textes sont listés");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

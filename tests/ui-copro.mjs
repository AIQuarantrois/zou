// Parcours « Copropriété et sûretés » dans un vrai navigateur : questions, dates limites calculées, lettres, assistant, services.
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
for (const t of ["Je suis copropriétaire", "On me demande de me porter caution", "Hypothèque, gage : garantir un prêt"]) {
  assert.ok(await page.locator(".life-b", { hasText: t }).count(), "tuile manquante : " + t);
}
ok("accueil : les 3 situations « copropriété et sûretés » sont proposées");
const again = async (label) => {
  await page.goto(BASE + "/#home");
  await start(page, label);
  if (!/Question/.test(await page.locator("#vieStep").innerText())) await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
};

// ---- 1. Copropriété : le syndic réclame des charges (état notifié il y a 3 jours)
await start(page, "Je suis copropriétaire");
await pick(page, "Syndic"); await pick(page, "charges de copropriété sont impayées");
const notif = plusDays(-3);
await setDate(page, notif);
let t = await plan(page);
assert.match(t, /Demander l'homologation au président du tribunal/); assert.match(t, frRe(addD(notif, 10)));
assert.match(t, /art\. 27/i); assert.match(t, /hypothèque forcée/); assert.match(t, /privilège sur les meubles/i);
await page.fill("#vl-copro-montant", "250 000 Ar");
assert.match(await page.locator("#vieBody .sheet").innerText(), /250 000 Ar/);
assert.match(await page.locator("#vieBody .sheet").innerText(), /article 27/);
await noHScroll(page, "plan copropriété");
ok("copropriété / charges (syndic) : homologation possible à partir du " + addD(notif, 10) + ", lettre de notification pré-remplie");

// Le copropriétaire visé voit la même date comme limite pour payer ou contester
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Copropriétaire"); await pick(page, "charges de copropriété sont impayées"); await setDate(page, notif);
t = await plan(page);
assert.match(t, /Payer ou contester avant l'homologation/); assert.match(t, frRe(addD(notif, 10)));
ok("copropriété / charges (copropriétaire) : même date, présentée comme limite pour payer ou contester");

// ---- 2. Copropriété : quelle majorité ?
await again("Je suis copropriétaire");
await pick(page, "Copropriétaire"); await pick(page, "décision (vote)"); await pick(page, "règlement de copropriété");
t = await plan(page);
assert.match(t, /Il faut une double majorité/); assert.match(t, /trois quarts des voix/); assert.match(t, /conservation de la propriété foncière/);
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Copropriétaire"); await pick(page, "décision (vote)"); await pick(page, "assurance");
t = await plan(page);
assert.match(t, /La majorité des voix suffit/);
ok("copropriété / vote : double majorité pour le règlement, majorité simple pour l'assurance");

// ---- 3. Acheteur d'un appartement
await again("Je suis copropriétaire");
await pick(page, "Acheteur");
t = await plan(page);
assert.match(t, /état des charges/i); assert.match(t, /titre foncier distinct/); assert.match(t, /arrêté du 8 août 1946/);
ok("copropriété / acheteur : état des charges, titre distinct, et limite d'application du décret signalée");

// ---- 4. Caution : avant de signer, cautionnement général
await page.goto(BASE + "/#home");
await start(page, "On me demande de me porter caution");
await pick(page, "On me demande de me porter caution"); await pick(page, "tous les engagements"); await pick(page, "Oui", true);
t = await plan(page);
assert.match(t, /solidaire/); assert.match(t, /somme maximale/); assert.match(t, /art\. 12/i); assert.match(t, /art\. 19/i); assert.match(t, /chiffres et en toutes lettres/);
assert.equal(await page.locator(".vie-dl").count(), 0);
ok("caution / avant de signer : forme exigée, somme maximale, révocation, information trimestrielle");
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "On me demande de me porter caution"); await pick(page, "dette précise"); await pick(page, "Non, je ne sais pas");
assert.match(await plan(page), /devant notaire/);
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "On me demande de me porter caution"); await pick(page, "première demande");
t = await plan(page);
assert.match(t, /plus dangereux/); assert.match(t, /art\. 48/i);
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "On me demande de me porter caution"); await pick(page, "lettre d'intention");
assert.match(await plan(page), /requalif|véritable cautionnement/);
ok("caution : acte authentique si l'on ne sait pas écrire, garantie à première demande, lettre d'intention");

// ---- 5. Caution : le créancier réclame
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "réclame de payer"); await pick(page, "Non, ou je ne m'en souviens pas"); await pick(page, "Non, il ne le dit pas"); await pick(page, "Non, une dette précise");
t = await plan(page);
assert.match(t, /peut être contesté/); assert.match(t, /bénéfice de discussion/); assert.match(t, /Avis au débiteur principal avant paiement/);
await page.fill("#vl-caution-caution", "Rasoa Rakoto");
assert.match(await page.locator("#vieBody .sheet").innerText(), /Rasoa Rakoto/);
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "réclame de payer"); await pick(page, "Oui", true); await pick(page, "caution simple"); await pick(page, "Oui, un cautionnement général");
t = await plan(page);
assert.match(t, /Exigez la discussion du débiteur/); assert.match(t, /art\. 19/i);
ok("caution / réclamation : forme contestable, discussion si caution simple, avis au débiteur avant paiement");

// ---- 6. Caution : j'ai payé
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "J'ai payé"); await pick(page, "Non", true);
t = await plan(page);
assert.match(t, /perdu votre recours/); assert.match(t, /action en répétition/); assert.match(t, /Demande de remboursement au débiteur/);
ok("caution / paiement sans avoir prévenu : recours menacé, action contre le créancier conservée");

// ---- 7. Garanties : terrain titré
await again("Hypothèque, gage : garantir un prêt");
await pick(page, "Celui qui prête"); await pick(page, "titre foncier");
t = await plan(page);
assert.match(t, /acte authentique/i); assert.match(t, /art\. 193/i); assert.match(t, /inopposable aux tiers/); assert.match(t, /trois ans d'intérêts/);
assert.match(t, /Qui est payé en premier sur le prix d'un immeuble/);
await noHScroll(page, "plan hypothèque");
ok("garantie / terrain titré : notaire, désignation, inscription, rang des créanciers");
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "récupérer ou libérer"); await pick(page, "titre foncier");
t = await plan(page);
assert.match(t, /mainlevée/i); assert.match(t, /art\. 191/i);
ok("garantie / libérer un terrain : mainlevée judiciaire en cas de refus");

// ---- 8. Garanties : chantier (travaux achevés il y a 10 jours)
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Celui qui prête"); await pick(page, "chantier de construction");
const fin = plusDays(-10);
await setDate(page, fin);
t = await plan(page);
assert.match(t, /Rendre l'inscription définitive/); assert.match(t, frRe(addM(fin, 1))); assert.match(t, /art\. 202/i);
ok("garantie / chantier : inscription provisoire à rendre définitive avant " + addM(fin, 1) + " (achèvement + 1 mois)");

// ---- 9. Garanties : matériel (5 ans), stocks (1 an), parts (5 ans)
const insc = plusDays(-100);
for (const [bien, ans, art] of [["matériel professionnel", 60, "art\\. 121"], ["stocks de marchandises", 12, "art\\. 129"], ["parts sociales", 60, "art\\. 139"]]) {
  await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
  await pick(page, "Celui qui prête"); await pick(page, bien);
  await setDate(page, insc);
  t = await plan(page);
  assert.match(t, /Renouveler l'inscription/); assert.match(t, frRe(addM(insc, ans))); assert.match(t, new RegExp(art, "i"));
}
ok("garantie / matériel, stocks, parts : renouvellement à 5 ans, 1 an et 5 ans de l'inscription");

// ---- 10. Garanties : terrain sans titre (fehivava), gage, réserve de propriété
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Celui qui prête"); await pick(page, "terrain sans titre foncier");
t = await plan(page);
assert.match(t, /fehivava/i); assert.match(t, /tsatoka/); assert.match(t, /art\. 207/i);
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Celui qui prête"); await pick(page, "bien meuble remis");
const somm = plusDays(-2);
await setDate(page, somm);
t = await plan(page);
assert.match(t, /Vendre le gage/); assert.match(t, frRe(addD(somm, 8))); assert.match(t, /pacte commissoire/);
await page.locator("#vieBody .link-btn", { hasText: "Modifier mes réponses" }).click();
await pick(page, "Celui qui emprunte"); await pick(page, "paiement différé");
t = await plan(page);
assert.match(t, /propriétaire/); assert.match(t, /art\. 155/i);
ok("garantie / fehivava (tsatoka interdit), gage (vente à +8 jours), réserve de propriété");

// ---- Assistant
await page.goto(BASE + "/#home");
await page.fill("#askInput", "Mon syndic de copropriété réclame des charges impayées"); await page.press("#askInput", "Enter");
await page.waitForSelector("#askVie:not([hidden])");
assert.match(await page.locator("#askVie").innerText(), /copropriétaire d'un immeuble/);
await page.fill("#askAgainInput", "Peut-on se porter caution sans écrire la somme ?"); await page.press("#askAgainInput", "Enter");
await page.waitForFunction(() => /caution/.test((document.querySelector("#askVie") || {}).textContent || ""));
ok("assistant : propose « copropriété » (et non « faillite ») pour un syndic de copropriété, « caution » pour un cautionnement");

// ---- Services et textes (écran large)
await page.close();
({ page } = await open({ width: 1280, height: 900 }));
await page.goto(BASE + "/#services.copro"); await page.waitForTimeout(400);
const svcText = await page.locator('[data-view="services"]').innerText();
assert.match(svcText, /3 services sur \d+/); assert.match(svcText, /Je suis copropriétaire/); assert.match(svcText, /me porter caution/);
ok("services : le domaine « Copropriété et sûretés » liste ses 3 parcours");
for (const [dom, re] of [["entreprise", /5 services sur \d+/], ["famille", /7 services sur \d+/]]) {
  await page.goto(BASE + "/#services." + dom); await page.waitForTimeout(300);
  assert.match(await page.locator('[data-view="services"]').innerText(), re);
}
ok("services : « Entreprise et commerce » (5) et « Famille » (7) sont inchangés");
await page.goto(BASE + "/#texts"); await page.waitForTimeout(300);
for (const ref of ["Décret n° 50-1631", "Loi n° 2003-041"]) {
  await page.getByPlaceholder("Rechercher un texte").fill(ref.replace(/^\D+ n° /, ""));
  await page.waitForTimeout(250);
  assert.ok(await page.locator('[data-view="texts"]').getByText(ref).first().isVisible(), ref);
}
ok("textes juridiques : le décret sur la copropriété et la loi sur les sûretés sont listés");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console`);

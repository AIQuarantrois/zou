// Impression, PDF et partage des plans et des lettres, dans un vrai navigateur : la mise en page est contrôlée sur un PDF réellement généré.
// Même prérequis que tests/ui-famille.mjs (serveur local, base vide, playwright-core) ; pdftotext et pdfinfo (poppler) pour lire le PDF.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
const OUT = process.env.ZOU_PDF_DIR || mkdtempSync(join(tmpdir(), "zou-pdf-"));
const ISO = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const plusDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return ISO(d); };
const fr = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

async function open(viewport = { width: 1280, height: 900 }, share = false) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((withShare) => {
    window.__printed = 0;
    window.print = () => { window.__printed++; };
    if (withShare) navigator.share = async (d) => { window.__shared = d; };
  }, share);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + "/");
  await page.waitForSelector(".life-b");
  return { ctx, page };
}
const pick = async (page, t) => { await page.locator(".vie-opt", { hasText: t }).first().click(); await page.waitForTimeout(220); };
async function visaPlan(page) {
  await page.goto(BASE + "/#vie.visa"); await page.waitForTimeout(300);
  await pick(page, "déjà à Madagascar"); await pick(page, "visa de séjour d'immigrant");
  await page.fill('#vieBody input[type="date"]', plusDays(200)); await page.locator("#vieBody .btn", { hasText: "Continuer" }).click(); await page.waitForTimeout(250);
  await pick(page, "Oui");
}
const pdfOf = async (page, name) => {
  await page.emulateMedia({ media: "print" });
  const buf = await page.pdf({ preferCSSPageSize: true, printBackground: false });
  await page.emulateMedia({ media: "screen" });
  const file = join(OUT, name + ".pdf");
  writeFileSync(file, buf);
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [file]).toString())[1]);
  const text = execFileSync("pdftotext", ["-layout", file, "-"]).toString().split("\f");
  return { file, pages, text };
};

let { page } = await open();
await visaPlan(page);
await page.fill("#vl-visa-nom", "John Smith"); await page.fill("#vl-visa-adr", "Lot 12, Antananarivo");
await page.locator("#vieBody .vie-list li input[type=checkbox]").first().check();

// ---- 1. Plan : le document d'impression
await page.locator(".vie-tools .link-btn", { hasText: "Imprimer ou enregistrer en PDF" }).click();
await page.waitForSelector("#printDoc", { state: "attached" });
await page.waitForFunction(() => window.__printed === 1);
const title = await page.locator("#printDoc h1").innerText();
assert.match(title, /Visa de long séjour/);
assert.equal(await page.locator("#printDoc .pd-table tbody tr").first().evaluate((e) => e.closest(".pd-qa") === null), true);
assert.equal(await page.locator("#printDoc .pd-table:not(.pd-qa) tbody tr").count(), 2);
assert.ok((await page.locator("#printDoc .pd-list li").count()) >= 4);
assert.equal(await page.locator("#printDoc .pd-box.on").count(), 1);
assert.equal(await page.locator("#printDoc .pd-qa tbody tr").count(), 4);
assert.match(await page.locator("#printDoc .pd-letter").innerText(), /John Smith/);
assert.match(await page.title(), /^ZOU - Plan - /);
ok("plan : document A4 construit (dates, étapes, cases cochées conservées, lettre pré-remplie, réponses) et titre du PDF");

// ---- 2. Mise en page réelle : PDF généré par le navigateur
const plan = await pdfOf(page, "plan-visa");
assert.ok(plan.pages >= 2, "le plan doit tenir sur plusieurs pages A4, trouvé " + plan.pages);
const all = plan.text.join("\n");
assert.match(all, /Plan personnalisé/); assert.match(all, /Établi le/);
assert.match(all, /Étape 1 :/); assert.match(all, /Les textes sur lesquels repose ce plan/);
assert.match(all, /Relecture par un juriste : à venir/);
assert.doesNotMatch(all, /Posez votre question de droit/); assert.doesNotMatch(all, /Accueil\s+Services/);
assert.match(all, /page 1 sur \d/);
const letterPage = plan.text.findIndex((t) => /lettre type à compléter/i.test(t));
assert.equal(letterPage, plan.pages - 1, "la lettre doit être la dernière page, détachable");
for (const x of [/Ce qu'il faut faire/, /Bon à savoir/, /Vos réponses/, /Les textes sur lesquels/]) assert.doesNotMatch(plan.text[letterPage], x);
assert.doesNotMatch(plan.text[letterPage], /ZOU · page/); assert.match(plan.text[plan.pages - 2], /ZOU · page \d+ sur \d+/);
assert.match(plan.text[letterPage], /John Smith/); assert.match(plan.text[letterPage], /Signature/);
assert.ok(plan.text[0].replace(/\s+/g, " ").includes(title.replace(/\s+/g, " ")), "le titre est sur la première page");
ok("PDF du plan : " + plan.pages + " pages A4, rien de l'écran de l'application, lettre seule sur sa page, pied de page numéroté (" + plan.file + ")");

// ---- 3. Fin de l'impression : l'écran est rétabli
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
assert.equal(await page.locator("#printDoc").count(), 0);
assert.equal(await page.evaluate(() => document.body.classList.contains("printing")), false);
assert.doesNotMatch(await page.title(), /^ZOU - Plan/);
ok("après l'impression, le document disparaît et le titre de la page est rétabli");

// ---- 4. La lettre seule : prête à envoyer
await page.locator(".vie-letter .btn", { hasText: "Imprimer la lettre" }).click();
await page.waitForSelector("#printDoc", { state: "attached" });
// (le navigateur envoie « afterprint » en produisant le PDF : on contrôle donc le document avant)
assert.match(await page.locator("#printDoc .pd-obj").textContent(), /^Objet/);
assert.equal(await page.locator("#printDoc .pd-to").count(), 1);
assert.ok((await page.locator("#printDoc .pd-blank").count()) >= 1);
assert.match(await page.title(), /^ZOU - Demande de renouvellement/);
const letter = await pdfOf(page, "lettre-visa");
assert.equal(letter.pages, 1);
const lt = letter.text[0];
assert.match(lt, /Monsieur le Ministre/); assert.match(lt, /Objet : demande de renouvellement/); assert.match(lt, /John Smith/); assert.match(lt, /Signature/);
assert.doesNotMatch(lt, /Étape 1/);
assert.doesNotMatch(lt, /ZOU · page/, "pas de pied de page ZOU sur une lettre à envoyer");
ok("lettre : une page A4, destinataire à droite, objet en gras, champs vides en pointillés, zone de signature");
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));

// ---- 5. Lettre type (page Lettres types)
await page.goto(BASE + "/#model.saisine-inspection-travail"); await page.waitForTimeout(400);
await page.locator('[data-act="model-print"]').click();
await page.waitForSelector("#printDoc", { state: "attached" });
const model = await pdfOf(page, "lettre-type");
assert.ok(model.pages <= 2);
assert.match(model.text.join("\n"), /inspection/i);
assert.match(model.text.join("\n"), /Signature/);
assert.equal(await page.evaluate(() => window.__printed), 3);
ok("page « Lettres types » : le bouton imprime la lettre (le message « bientôt disponible » a disparu)");
await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
await page.close();

// ---- 6. Partage : feuille native du téléphone
({ page } = await open({ width: 390, height: 844 }, true));
await visaPlan(page);
await page.locator(".vie-tools .link-btn", { hasText: "Partager" }).click();
const shared = await page.evaluate(() => window.__shared);
assert.match(shared.title, /^ZOU : /); assert.match(shared.text, /Dates limites :/); assert.match(shared.text, /Demander le renouvellement|Déposer la demande de renouvellement/);
assert.match(shared.text, new RegExp(fr(plusDays(200)).replace(/\s/g, "\\s")));
assert.ok(shared.url.endsWith("/#vie.visa"));
assert.doesNotMatch(shared.text, /John|Lot 12/);
ok("partage natif : titre, verdict, dates limites et lien vers le parcours ; aucune donnée personnelle");
await page.close();

// ---- 7. Partage sans feuille native : WhatsApp, e-mail, copier
({ page } = await open({ width: 390, height: 844 }, false));
await visaPlan(page);
assert.equal(await page.locator(".vie-share").isHidden(), true);
await page.locator(".vie-tools .link-btn", { hasText: "Partager" }).click();
assert.equal(await page.locator(".vie-share").isVisible(), true);
const wa = await page.locator(".vie-share a", { hasText: "WhatsApp" }).getAttribute("href");
assert.ok(wa.startsWith("https://wa.me/?text=")); assert.match(decodeURIComponent(wa), /Visa de long séjour/);
assert.match(await page.locator(".vie-share a", { hasText: "E-mail" }).getAttribute("href"), /^mailto:\?subject=/);
assert.equal(await page.locator(".vie-share button", { hasText: "Copier le résumé" }).count(), 1);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
ok("partage sans feuille native : WhatsApp, e-mail et copie, sans défilement horizontal sur téléphone");
await page.close();

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} vérifications réussies, aucune erreur console. PDF de contrôle : ${OUT}`);

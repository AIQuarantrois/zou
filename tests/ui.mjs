// Parcours de l'interface dans un vrai navigateur, contre « npm run serve:local » lancé avec ZOU_FAKE_AI=1 sur une base vide.
// Nécessite playwright-core (non installé par défaut) : npm i --no-save playwright-core
// Usage : ZOU_CHROME=/chemin/vers/chrome node tests/ui.mjs   (ZOU_URL pour une autre adresse, ZOU_SHOTS=dossier/ pour des captures)
import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const BASE = process.env.ZOU_URL || "http://localhost:3999";
const SHOTS = process.env.ZOU_SHOTS || "";
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);

async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${name} pageerror: ${e.message}`));
  // Les polices Google ne passent pas le proxy du bac à sable (certificat) : sans rapport avec l'application.
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) problems.push(`${name} console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`[après ${n}] ${name} HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
  await page.goto(BASE + "/");
  await page.waitForFunction(() => document.querySelector('[data-view="home"]') && !document.querySelector('[data-view="home"]').hidden);
  return { ctx, page };
}
const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const r = await fetch(p, { method: m, headers: b ? { "content-type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, data: await r.json() };
}, [method, path, body]);
const vis = (page, text) => page.locator("[data-view]:not([hidden])").getByText(text).first().waitFor();
const visCount = (page, text) => page.locator("[data-view]:not([hidden])").getByText(text).count();
async function until(page, path, pred, label) {
  for (let i = 0; i < 50; i++) {
    const r = await api(page, "GET", path);
    if (pred(r.data)) return r.data;
    await page.waitForTimeout(200);
  }
  const st = await page.evaluate(() => ({ sync: (document.querySelector("#acc-sync") || {}).textContent, map: localStorage.getItem("zou_sync_v1") }));
  throw new Error("délai dépassé : " + label + " " + JSON.stringify(st));
}
const waitSync = (page) => page.waitForFunction(() => /Tout est sauvegardé/.test((document.querySelector("#acc-sync") || {}).textContent || ""), null, { timeout: 10000 });

const A = await device("A");
const page = A.page;

// 1. Invité : une date ajoutée reste sur l'appareil
await page.goto(BASE + "/#agenda");
await page.fill("#a-title", "Audience prud'homale");
await page.fill("#a-date", "2030-03-15");
await page.selectOption("#a-remind", "3");
await page.click('#agendaForm button[type="submit"]');
await vis(page, "Audience prud'homale");
ok("invité : date ajoutée localement");

// 2. Assistant branché sur /api/ask
await page.goto(BASE + "/#home");
await page.fill("#askInput", "Quel préavis pour une démission ?");
await page.press("#askInput", "Enter");
await page.waitForFunction(() => /Réponse de test/.test(document.querySelector("#askBody").textContent));
assert.equal(await page.locator("#h-ask").textContent(), "Quel préavis pour une démission ?");
assert.equal(await page.locator("#askSources .src").count(), 2);
assert.match(await page.locator("#askSrcLabel").textContent(), /2 sources citées/);
assert.equal(await page.locator("#askBody a.cite").count(), 3);
if (SHOTS) await page.screenshot({ path: SHOTS + "1-assistant.png", fullPage: true });
ok("assistant : réponse, renvois [n] et sources");
await page.fill("#askAgainInput", "Quand commence le préavis ?");
await page.press("#askAgainInput", "Enter");
await page.waitForFunction(() => document.querySelector("#h-ask").textContent === "Quand commence le préavis ?" && /Réponse de test/.test(document.querySelector("#askBody").textContent));
ok("assistant : question suivante depuis la réponse");

// 3. Connexion par code e-mail, import des données invité
await page.goto(BASE + "/#account");
await page.fill("#acc-email", "rina@example.mg");
await page.click("#acc-submit");
await page.waitForSelector("#acc-code-box:not([hidden])");
assert.match(await page.inputValue("#acc-code"), /^\d{6}$/);
await page.click("#acc-submit");
await page.waitForSelector("#accUser:not([hidden])");
await waitSync(page);
assert.match(await page.locator("#acc-who").textContent(), /rina@example\.mg/);
let ev = await api(page, "GET", "/api/events");
assert.deepEqual(ev.data.events.map((e) => [e.title, e.due_on, e.remind_days]), [["Audience prud'homale", "2030-03-15", [3]]]);
if (SHOTS) await page.screenshot({ path: SHOTS + "2-compte.png", fullPage: true });
ok("connexion : code e-mail, données de l'invité rattachées (sans les exemples)");

// 4. Modifications après connexion : envoyées au serveur
await page.goto(BASE + "/#agenda");
assert.equal(await page.locator("[data-guest]").first().isHidden(), true);
await page.fill("#a-title", "Fin du bail");
await page.fill("#a-date", "2030-06-01");
await page.selectOption("#a-channel", "Aucun");
await page.click('#agendaForm button[type="submit"]');
await until(page, "/api/events", (d) => d.events.length === 2, 'events.length === 2');
ev = await api(page, "GET", "/api/events");
assert.deepEqual(ev.data.events.find((e) => e.title === "Fin du bail").remind_days, []);
const firstId = await page.evaluate(() => JSON.parse(localStorage.getItem("dm_state_v2")).dates.find((d) => d.title === "Audience prud'homale").id);
await page.click(`[data-act="del-date"][data-id="${firstId}"]`);
await until(page, "/api/events", (d) => d.events.length === 1, 'events.length === 1');
ok("connecté : ajout et suppression de dates synchronisés");

// Démarche « Démissionner » et document du coffre
await page.goto(BASE + "/?demarche#flow"); // chargement complet : la démarche est marquée commencée
await until(page, "/api/cases", (d) => d.cases.some((c) => c.kind === "demission"), 'cases.some((c) => c.kind === "demission")');
await page.goto(BASE + "/#vault");
const PDF = Buffer.concat([Buffer.from("%PDF-1.4 contrat signé\n"), Buffer.alloc(2024, 7)]);
await page.setInputFiles("#vaultInput", { name: "contrat-signe.pdf", mimeType: "application/pdf", buffer: PDF });
await until(page, "/api/documents", (d) => d.documents.some((d) => d.title === "contrat-signe.pdf" && d.size_bytes === PDF.length && d.mime === "application/pdf" && d.has_file), "document avec fichier");
await page.locator('[data-view="vault"]').getByText("Fichier sauvegardé").first().waitFor();
// Trop lourd : les informations sont gardées, pas le fichier
await page.setInputFiles("#vaultInput", { name: "scan-enorme.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4 * 1024 * 1024 + 10) });
await page.waitForFunction(() => /dépasse 4 Mo/.test(document.querySelector("#toast").textContent));
await until(page, "/api/documents", (d) => d.documents.some((d) => d.title === "scan-enorme.pdf" && !d.has_file), "document sans fichier");
// « Joindre le fichier » sur ce document
const bigId = await page.evaluate(() => JSON.parse(localStorage.getItem("dm_state_v2")).docs.find((d) => d.name === "scan-enorme.pdf").id);
await page.click(`[data-act="doc-attach"][data-id="${bigId}"]`).catch(() => {});
await page.setInputFiles("#attachInput", { name: "scan-reduit.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(1500, 1) });
await until(page, "/api/documents", (d) => d.documents.some((d) => d.title === "scan-enorme.pdf" && d.has_file && d.mime === "image/jpeg"), "fichier joint après coup");
await page.click(`[data-act="del-doc"][data-id="${bigId}"]`);
await until(page, "/api/documents", (d) => d.documents.length === 1, "suppression");
ok("connecté : dossier « Démission », document et fichier du coffre sauvegardés ; trop lourd refusé, fichier joint après coup");

// 5. Deuxième appareil : on retrouve tout
const B = await device("B");
await B.page.goto(BASE + "/#account");
await B.page.fill("#acc-email", "RINA@example.mg");
await B.page.click("#acc-submit");
await B.page.waitForSelector("#acc-code-box:not([hidden])");
await B.page.click("#acc-submit");
await B.page.waitForSelector("#accUser:not([hidden])");
await waitSync(B.page);
await B.page.goto(BASE + "/#agenda");
await vis(B.page, "Fin du bail");
assert.equal(await visCount(B.page, "Audience prud'homale"), 0);
await B.page.goto(BASE + "/#vault");
await vis(B.page, "contrat-signe.pdf");
const docIdB0 = await B.page.evaluate(() => JSON.parse(localStorage.getItem("dm_state_v2")).docs.find((d) => d.name === "contrat-signe.pdf").id);
const [dl] = await Promise.all([B.page.waitForEvent("download"), B.page.click(`[data-act="doc-open"][data-id="${docIdB0}"]`)]);
assert.equal(dl.suggestedFilename(), "contrat-signe.pdf");
const got = await (await import("node:fs/promises")).readFile(await dl.path());
assert.ok(got.equals(PDF), "contenu du fichier identique");
const flowB = await B.page.evaluate(() => JSON.parse(localStorage.getItem("dm_state_v2")).flow.started);
assert.equal(flowB, true);
ok("autre appareil : dates, démarche et document retrouvés, fichier téléchargé à l'identique");

// Suppression sur B → disparaît sur A au prochain retour
const docIdB = await B.page.evaluate(() => JSON.parse(localStorage.getItem("dm_state_v2")).docs.find((d) => d.name === "contrat-signe.pdf").id);
await B.page.click(`[data-act="del-doc"][data-id="${docIdB}"]`);
await until(B.page, "/api/documents", (d) => d.documents.length === 0, 'documents.length === 0');
await page.goto(BASE + "/#account");
await page.click('[data-act="sync-now"]');
await waitSync(page);
const docsA = await page.evaluate(() => JSON.parse(localStorage.getItem("dm_state_v2")).docs.filter((d) => !d.example).length);
assert.equal(docsA, 0);
ok("suppression sur un appareil répercutée sur l'autre");

// 6. Espace professionnel → vérification → annuaire → demande de contact
await page.goto(BASE + "/#prospace");
await page.selectOption("#ps-type", "Notaire");
await page.fill("#ps-name", "Me Rina Rakoto");
await page.fill("#ps-reg", "CN-2024-118");
await page.selectOption("#ps-city", "Antsirabe");
await page.check('#ps-specs input[value="Foncier"]');
await page.fill("#ps-fee", "Sur devis");
await page.click('#psForm button[type="submit"]');
await page.waitForFunction(() => /En attente de vérification/.test(document.querySelector("#psStatus").textContent));
ok("inscription professionnelle envoyée (en attente)");
const pending = await (await fetch(BASE + "/api/admin/pros", { headers: { authorization: "Bearer " + "a".repeat(32) } })).json();
const proId = pending.pros[0].id;
await fetch(BASE + "/api/admin/pros/" + proId, { method: "PATCH", headers: { authorization: "Bearer " + "a".repeat(32), "content-type": "application/json" }, body: JSON.stringify({ status: "verified" }) });

const C = await device("C"); // visiteur sans compte
await C.page.goto(BASE + "/#pros");
await vis(C.page, "Me Rina Rakoto");
assert.match(await C.page.locator("#prosNote").textContent(), /Professionnels vérifiés/);
assert.equal(await visCount(C.page, "Profil fictif"), 0);
await C.page.locator("[data-view]:not([hidden])").getByText("Demander un contact").first().click();
await C.page.fill('form[data-pro-contact] input[name="name"]', "Hery");
await C.page.fill('form[data-pro-contact] input[name="reply_to"]', "034 12 345 67");
await C.page.fill('form[data-pro-contact] textarea[name="message"]', "Bonjour, j'ai une question sur une succession à Antsirabe.");
await C.page.click('form[data-pro-contact] button[type="submit"]');
if (SHOTS) await C.page.screenshot({ path: SHOTS + "3-annuaire.png", fullPage: true });
await C.page.waitForFunction(() => /Demande envoyée/.test(document.querySelector("#toast").textContent));
ok("annuaire : profil vérifié affiché, demande de contact sans compte");

await page.goto(BASE + "/?retour#prospace");
await page.waitForFunction(() => /Hery/.test(document.querySelector("#psReqs").textContent) && /Publiée/.test(document.querySelector("#psStatus").textContent));
if (SHOTS) await page.screenshot({ path: SHOTS + "4-espace-pro.png", fullPage: true });
ok("espace professionnel : fiche publiée et demande reçue");

// 7. Formulaire de contact
await C.page.goto(BASE + "/#page.contact");
await C.page.fill("#c-name", "Hery");
await C.page.fill("#c-mail", "hery@example.mg");
await C.page.fill("#c-msg", "Je signale une erreur dans un guide.");
await C.page.click('#contactForm button[type="submit"]');
await C.page.waitForFunction(() => /Message envoyé/.test(document.querySelector("#toast").textContent));
ok("formulaire de contact envoyé");

// 8. Effacer l'appareil ne touche pas au compte ; déconnexion
await page.goto(BASE + "/#account");
await page.click('[data-act="logout"]');
await page.waitForSelector("#accGuest:not([hidden])");
assert.equal((await api(page, "GET", "/api/me")).data.user, null);
ok("déconnexion");
await B.page.evaluate(() => document.querySelector('[data-act="wipe"]') ? document.querySelector('[data-act="wipe"]').click() : null);
const evAfter = await (await fetch(BASE + "/api/admin/pros?status=verified", { headers: { authorization: "Bearer " + "a".repeat(32) } })).json();
assert.equal(evAfter.pros.length, 1);
await page.fill("#acc-email", "rina@example.mg");
await page.click("#acc-submit");
await page.waitForSelector("#acc-code-box:not([hidden])");
await page.click("#acc-submit");
await page.waitForSelector("#accUser:not([hidden])");
await waitSync(page);
const evFinal = await api(page, "GET", "/api/events");
assert.equal(evFinal.status, 200, JSON.stringify(evFinal.data));
assert.deepEqual(evFinal.data.events.map((e) => e.title), ["Fin du bail"]);
ok("effacer un appareil connecté ne supprime rien du compte");

await browser.close();
if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exit(1); }
console.log(`\n${n} scénarios réussis, aucune erreur console`);

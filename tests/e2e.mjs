// Test de bout en bout des routes, sur un Postgres local (voir tests/stubs/neon.mjs).
import assert from "node:assert/strict";

process.env.DATABASE_URL = "stub://local";
process.env.AUTH_SECRET = "s".repeat(48);
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.ADMIN_TOKEN = "a".repeat(32);
process.env.CRON_SECRET = "c".repeat(24);
process.env.RESEND_API_KEY = "re_test";
process.env.MAIL_FROM = "ZOU <no-reply@example.com>";
process.env.AUTH_DEV_ECHO = "1";
const OIDC = process.argv.includes("--blob-oidc");
process.env.TEST_DB = OIDC ? "zou_e2e_oidc" : "zou_e2e";
// --blob-oidc : magasin relié par identifiant (BLOB_STORE_ID), sans clé read-write.
if (OIDC) process.env.BLOB_STORE_ID = "store_test";
else process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";

const mails = []; const aiCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("api.resend.com")) { mails.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }
  if (String(url).includes("api.anthropic.com")) {
    const b = JSON.parse(init.body); aiCalls.push(b);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "Vous pouvez démissionner librement [1]. Le préavis dépend de votre ancienneté [2]." }] }), { status: 200 });
  }
  return realFetch(url, init);
};

const H = "https://zou.test";
let cookie = "";
async function call(mod, method, path, { json, headers = {}, ctx, raw } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (json !== undefined || raw !== undefined) h["content-type"] = h["content-type"] || "application/json";
  const req = new Request(H + path, { method, headers: { host: "zou.test", ...h }, body: raw ?? (json !== undefined ? JSON.stringify(json) : undefined) });
  const res = await mod[method](req, ctx || {});
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.startsWith("zou_session=;") || /Max-Age=0/.test(set) ? "" : set.split(";")[0];
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const ADMIN = { authorization: "Bearer " + process.env.ADMIN_TOKEN };
let passed = 0;
const ok = (name) => { passed++; console.log("  ok", name); };

const M = (p) => import("../" + p);
const health = await M("app/api/health/route.ts");
const migrate = await M("app/api/admin/migrate/route.ts");
const ingest = await M("app/api/admin/ingest/route.ts");
const authReq = await M("app/api/auth/request/route.ts");
const authVerify = await M("app/api/auth/verify/route.ts");
const authOut = await M("app/api/auth/logout/route.ts");
const me = await M("app/api/me/route.ts");
const cases = await M("app/api/cases/route.ts");
const caseId = await M("app/api/cases/[id]/route.ts");
const events = await M("app/api/events/route.ts");
const eventId = await M("app/api/events/[id]/route.ts");
const docs = await M("app/api/documents/route.ts");
const docId = await M("app/api/documents/[id]/route.ts");
const imp = await M("app/api/import/route.ts");
const pros = await M("app/api/pros/route.ts");
const prosMe = await M("app/api/pros/me/route.ts");
const prosContact = await M("app/api/pros/[id]/contact/route.ts");
const adminPros = await M("app/api/admin/pros/route.ts");
const adminProId = await M("app/api/admin/pros/[id]/route.ts");
const contact = await M("app/api/contact/route.ts");
const ask = await M("app/api/ask/route.ts");
const cron = await M("app/api/cron/reminders/route.ts");

// --- base vide : migration protégée
let r = await call(migrate, "POST", "/api/admin/migrate");
assert.equal(r.status, 401); ok("migration refusée sans jeton");
r = await call(migrate, "POST", "/api/admin/migrate", { headers: ADMIN, json: {} });
assert.equal(r.status, 200); assert.deepEqual(r.data.applied, ["001_init", "002_legal_sources"]); ok("migration appliquée");
r = await call(migrate, "POST", "/api/admin/migrate", { headers: ADMIN, json: {} });
assert.deepEqual(r.data.applied, []); ok("migration idempotente");

r = await call(health, "GET", "/api/health");
assert.equal(r.data.database, "ok"); assert.equal(r.data.capabilities.ai, true); ok("health");

// --- corpus
r = await call(ingest, "POST", "/api/admin/ingest", { headers: ADMIN, json: { source: "code-travail", title: "Code du travail", chunks: [
  { article: "Art. 43", text: "Le salarié peut démissionner librement à condition d'indiquer le motif de sa décision." },
  { article: "Art. 44", text: "Le préavis est fixé par décret selon l'ancienneté et la catégorie professionnelle." },
  { article: "Art. 90", text: "Le congé annuel est de deux jours et demi par mois de service effectif." } ] } });
assert.equal(r.status, 200); assert.equal(r.data.chunks, 3); ok("ingestion du corpus");
r = await call(ingest, "POST", "/api/admin/ingest", { headers: ADMIN, json: { source: "code-travail", title: "Code du travail", chunks: [{ article: "Art. 43", text: "Le salarié peut démissionner librement." }, { article: "Art. 44", text: "Le préavis dépend de l'ancienneté." }] } });
assert.equal(r.data.chunks, 2); assert.equal(r.data.status, "charge"); ok("ré-ingestion remplace la source");
r = await call(ingest, "POST", "/api/admin/ingest", { headers: ADMIN, json: { source: "code-travail", title: "Code du travail", chunks: [{ article: "Art. 43", text: "Le salarié peut démissionner librement." }, { article: "Art. 44", text: "Le préavis dépend de l'ancienneté." }] } });
assert.equal(r.data.status, "inchange"); ok("texte identique non réécrit");
r = await call(ingest, "POST", "/api/admin/ingest", { headers: ADMIN, json: { source: "code-travail", title: "Code du travail", chunks: [{ article: "Art. 1", text: "ok" }, { article: "Art. 2", text: "y".repeat(9000) }] } });
assert.equal(r.status, 400); assert.equal(r.data.error, "invalid_text"); ok("ingestion : article trop long refusé");
{
  // Échec en base au milieu du chargement : l'ancienne version doit rester intacte.
  const { q, tx } = await import("../lib/db.ts");
  const { ingestText } = await import("../lib/ingest.ts");
  const bad = { source: "code-travail", title: "Code du travail", chunks: [...Array.from({ length: 600 }, (_, i) => ({ article: `Art. ${i}`, heading: null, text: "a" })), { article: "Art. X", heading: null, text: null }] };
  await assert.rejects(ingestText({ q, tx }, bad, { force: true }));
  const n = await q(`SELECT count(*)::int AS n FROM legal_chunks WHERE source = 'code-travail'`);
  assert.equal(n[0].n, 2); ok("ingestion atomique : un échec laisse l'ancienne version");
}

// --- assistant (invité)
r = await call(ask, "POST", "/api/ask", { json: { question: "Combien de préavis pour une démission ?" } });
assert.equal(r.status, 200); assert.equal(r.data.grounded, true);
assert.ok(r.data.citations.length === 2 && r.data.citations[0].article); assert.ok(aiCalls[0].messages[0].content.includes("<passages>"));
ok("assistant : réponse sourcée, citations retenues");
r = await call(ask, "POST", "/api/ask", { json: { question: "Que dit la loi sur les dinosaures volants ?" } });
assert.equal(r.data.grounded, false); assert.equal(aiCalls.length, 1); ok("assistant : sans passage -> pas d'appel au modèle");
r = await call(ask, "POST", "/api/ask", { json: { question: "ok" } });
assert.equal(r.status, 400); ok("assistant : question trop courte refusée");

// --- sécurité de base
r = await call(cases, "GET", "/api/cases"); assert.equal(r.status, 401); ok("dossiers : 401 sans session");
r = await call(cases, "POST", "/api/cases", { headers: { origin: "https://evil.example" }, json: { title: "x" } }); assert.equal(r.status, 403); ok("origine étrangère refusée");
r = await call(authReq, "POST", "/api/auth/request", { raw: "email=a@b.co", headers: { "content-type": "application/x-www-form-urlencoded" } }); assert.equal(r.status, 415); ok("corps non JSON refusé");

// --- connexion par code
r = await call(authReq, "POST", "/api/auth/request", { json: { email: "Rajo@Example.com" } });
assert.equal(r.status, 200); assert.match(r.data.dev_code, /^\d{6}$/); const code = r.data.dev_code;
assert.equal(mails.at(-1).to[0], "rajo@example.com"); assert.ok(mails.at(-1).text.includes(code)); ok("code envoyé par e-mail");
r = await call(authVerify, "POST", "/api/auth/verify", { json: { email: "rajo@example.com", code: code === "000000" ? "111111" : "000000" } });
assert.equal(r.status, 401); ok("mauvais code refusé");
r = await call(authVerify, "POST", "/api/auth/verify", { json: { email: "rajo@example.com", code } });
assert.equal(r.status, 200); assert.ok(cookie.startsWith("zou_session=")); ok("connexion : cookie de session");
r = await call(authVerify, "POST", "/api/auth/verify", { json: { email: "rajo@example.com", code } });
assert.equal(r.status, 401); ok("code à usage unique");
r = await call(me, "GET", "/api/me"); assert.equal(r.data.user.email, "rajo@example.com"); ok("me : utilisateur connecté");
r = await call(me, "PATCH", "/api/me", { json: { name: "Rajo" } }); assert.equal(r.data.user.name, "Rajo"); ok("me : modification du nom");

// --- dossiers, agenda, coffre
r = await call(cases, "POST", "/api/cases", { json: { title: "Démission", kind: "travail", data: { step: 2 } } });
assert.equal(r.status, 201); const cid = r.data.case.id; ok("dossier créé");
r = await call(caseId, "PATCH", "/api/cases/" + cid, { ctx: { params: Promise.resolve({ id: cid }) }, json: { status: "closed", data: { step: 6 } } });
assert.equal(r.data.case.status, "closed"); assert.equal(r.data.case.data.step, 6); ok("dossier modifié");
r = await call(caseId, "PATCH", "/api/cases/" + cid, { ctx: { params: Promise.resolve({ id: "pas-un-uuid" }) }, json: { status: "open" } });
assert.equal(r.status, 400); ok("id invalide refusé");

const future = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);
r = await call(events, "POST", "/api/events", { json: { title: "Fin de préavis", due_on: future, remind_days: [7, 1], case_id: cid } });
assert.equal(r.status, 201); assert.equal(r.data.event.due_on, future); assert.deepEqual(r.data.event.remind_days, [7, 1]); const eid = r.data.event.id; ok("échéance créée (date en texte)");
r = await call(events, "POST", "/api/events", { json: { title: "x", due_on: "2026-13-45" } }); assert.equal(r.status, 400); ok("date invalide refusée");
r = await call(eventId, "PATCH", "/api/events/" + eid, { ctx: { params: Promise.resolve({ id: eid }) }, json: { remind_days: [3], note: "Remettre la lettre" } });
assert.deepEqual(r.data.event.remind_days, [3]); ok("échéance modifiée, rappels recalculés");
r = await call(events, "GET", "/api/events"); assert.equal(r.data.events.length, 1); ok("liste des échéances");

r = await call(docs, "POST", "/api/documents", { json: { title: "Contrat de travail", kind: "contrat", size_bytes: 120000, expires_on: future } });
assert.equal(r.status, 201); assert.equal(r.data.document.expires_on, future); const did = r.data.document.id; ok("document ajouté");
r = await call(docId, "PATCH", "/api/documents/" + did, { ctx: { params: Promise.resolve({ id: did }) }, json: { note: "Original chez le notaire", expires_on: null } });
assert.equal(r.data.document.expires_on, null); ok("document modifié");

// --- fichiers du coffre (Vercel Blob, accès privé)
{
  const fileMod = await M("app/api/documents/[id]/file/route.ts");
  const fctx = (id) => ({ params: Promise.resolve({ id }) });
  const send = (method, id, body, type, extra = {}) => fileMod[method](new Request(H + `/api/documents/${id}/file`, {
    method, headers: { host: "zou.test", cookie, ...(type ? { "content-type": type } : {}), ...extra }, body,
  }), fctx(id));
  const pdf = new TextEncoder().encode("%PDF-1.4 contrat signé");
  let res = await send("PUT", did, pdf, "application/pdf");
  let d = await res.json();
  assert.equal(res.status, 200); assert.equal(d.document.has_file, true); assert.equal(d.document.size_bytes, pdf.byteLength); assert.equal(d.document.mime, "application/pdf");
  const store = globalThis.__zouBlob;
  assert.equal(store.size, 1); const firstKey = [...store.keys()][0];
  assert.match(firstKey, new RegExp(`/coffre/[0-9a-f-]+/${did}-\\d+\\.pdf$`));
  ok("fichier joint au document (Blob privé)");
  res = await send("GET", did);
  assert.equal(res.status, 200); assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(res.headers.get("content-disposition"), /^attachment; filename="Contrat de travail\.pdf"/);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), pdf); ok("fichier téléchargé par son propriétaire");
  res = await send("PUT", did, new TextEncoder().encode("<html>"), "text/html"); assert.equal(res.status, 415); ok("type de fichier refusé");
  res = await send("PUT", did, new Uint8Array(4 * 1024 * 1024 + 1), "image/png"); assert.equal(res.status, 413); ok("fichier trop lourd refusé");
  res = await send("PUT", did, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png");
  d = await res.json(); assert.equal(d.document.mime, "image/png");
  assert.equal(store.size, 1); assert.ok(!store.has(firstKey)); ok("remplacement : l'ancien fichier est supprimé");
  r = await call(docs, "GET", "/api/documents"); assert.equal(r.data.documents.find((x) => x.id === did).has_file, true);
  res = await send("PUT", "00000000-0000-4000-8000-000000000000", pdf, "application/pdf"); assert.equal(res.status, 404); ok("document d'un autre compte ou inconnu : 404");
  const saved = cookie; cookie = "";
  res = await send("GET", did); assert.equal(res.status, 401); cookie = saved; ok("téléchargement refusé sans session");
  res = await send("PUT", did, pdf, "application/pdf", { origin: "https://evil.example" }); assert.equal(res.status, 403); ok("envoi depuis une autre origine refusé");
  r = await call(docs, "POST", "/api/documents", { json: { title: "Pièce à supprimer" } }); const tmp = r.data.document.id;
  await send("PUT", tmp, pdf, "application/pdf"); assert.equal(store.size, 2);
  r = await call(docId, "DELETE", "/api/documents/" + tmp, { ctx: fctx(tmp) }); assert.equal(store.size, 1); ok("document supprimé : son fichier aussi");
}

// --- import des données d'un invité (idempotent)
const payload = { cases: [{ client_id: "L1", title: "Titre foncier", kind: "terrain" }], events: [{ client_id: "LE1", title: "Opposition", due_on: future, case_client_id: "L1" }], documents: [{ client_id: "LD1", title: "Plan", case_client_id: "L1" }] };
r = await call(imp, "POST", "/api/import", { json: payload }); assert.deepEqual(r.data.imported, { cases: 1, events: 1, documents: 1 }); ok("import invité -> compte");
r = await call(imp, "POST", "/api/import", { json: payload }); assert.deepEqual(r.data.imported, { cases: 1, events: 0, documents: 0 }); ok("import rejoué sans doublon");

// --- professionnels
r = await call(pros, "POST", "/api/pros", { json: { profession: "avocat", display_name: "Me Rakoto", city: "Antananarivo", domains: ["travail", "foncier"], registration_no: "B-123" } });
assert.equal(r.status, 201); assert.equal(r.data.pro.status, "pending"); const pid = r.data.pro.id; ok("inscription professionnelle (en attente)");
r = await call(pros, "POST", "/api/pros", { json: { profession: "avocat", display_name: "Me Rakoto", city: "Tana" } }); assert.equal(r.status, 409); ok("une seule fiche par compte");
r = await call(pros, "GET", "/api/pros"); assert.equal(r.data.pros.length, 0); ok("annuaire : fiche en attente invisible");
r = await call(adminProId, "PATCH", "/api/admin/pros/" + pid, { ctx: { params: Promise.resolve({ id: pid }) }, json: { status: "verified" } }); assert.equal(r.status, 401); ok("vérification refusée sans jeton");
r = await call(adminPros, "GET", "/api/admin/pros", { headers: ADMIN }); assert.equal(r.data.pros.length, 1); ok("admin : file des fiches en attente");
r = await call(adminProId, "PATCH", "/api/admin/pros/" + pid, { headers: ADMIN, ctx: { params: Promise.resolve({ id: pid }) }, json: { status: "verified" } }); assert.equal(r.data.pro.status, "verified"); ok("fiche vérifiée");
r = await call(pros, "GET", "/api/pros?profession=avocat&city=tana&domain=travail"); assert.equal(r.data.pros.length, 1); assert.equal(r.data.pros[0].registration_no, "B-123"); ok("annuaire : filtres métier, ville, domaine");
const saved = cookie; cookie = "";
const nMails = mails.length;
r = await call(prosContact, "POST", "/api/pros/" + pid + "/contact", { ctx: { params: Promise.resolve({ id: pid }) }, json: { name: "Visiteur", reply_to: "visiteur@example.com", message: "Bonjour, je souhaite un rendez-vous." } });
assert.equal(r.status, 201); assert.equal(mails.length, nMails + 1); assert.ok(mails.at(-1).text.includes("visiteur@example.com")); ok("contact d'un professionnel sans compte");
cookie = saved;
r = await call(prosMe, "GET", "/api/pros/me"); assert.equal(r.data.requests.length, 1); ok("boîte de réception du professionnel");
r = await call(prosMe, "PATCH", "/api/pros/me", { json: { bio: "Droit du travail", domains: ["travail"] } }); assert.equal(r.data.pro.bio, "Droit du travail"); ok("fiche professionnelle modifiée");

// --- contact support
r = await call(contact, "POST", "/api/contact", { json: { name: "Rajo", email: "rajo@example.com", message: "Une question sur ZOU, merci." } }); assert.equal(r.status, 201); ok("formulaire de contact");

// --- rappels (cron)
r = await call(cron, "GET", "/api/cron/reminders"); assert.equal(r.status, 401); ok("cron refusé sans jeton");
r = await call(events, "POST", "/api/events", { json: { title: "Aujourd'hui", due_on: new Date().toISOString().slice(0, 10), remind_days: [0] } });
const before = mails.length;
r = await call(cron, "GET", "/api/cron/reminders", { headers: { authorization: "Bearer " + process.env.CRON_SECRET } });
assert.equal(r.status, 200); assert.ok(r.data.sent >= 1); assert.ok(mails.length > before); assert.ok(mails.at(-1).subject.startsWith("Rappel")); ok("rappel envoyé");
const again = await call(cron, "GET", "/api/cron/reminders", { headers: { authorization: "Bearer " + process.env.CRON_SECRET } });
assert.equal(again.data.sent, 0); ok("rappel envoyé une seule fois");

// --- limitation de débit
let last;
for (let i = 0; i < 6; i++) last = await call(authReq, "POST", "/api/auth/request", { json: { email: "spam@example.com" } });
assert.equal(last.status, 429); ok("limitation de débit des codes");

// --- déconnexion
r = await call(authOut, "POST", "/api/auth/logout", { json: {} }); assert.equal(cookie, ""); r = await call(cases, "GET", "/api/cases"); assert.equal(r.status, 401); ok("déconnexion");

// --- ingestion automatique du dossier textes/
{
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { connect, ingestFolder } = await import("../scripts/db-tasks.mjs");
  const dir = mkdtempSync(join(tmpdir(), "zou-textes-"));
  writeFileSync(join(dir, "Loi sur les baux.txt"), "# Loi sur les baux\n\nArticle 1\nLe bail est écrit.\n\nArticle 2\nLe loyer est payé chaque mois.\n");
  writeFileSync(join(dir, "decret.json"), JSON.stringify({ source: "decret-test", title: "Décret test", chunks: [{ article: "Art. 1", text: "Décret." }] }));
  writeFileSync(join(dir, "README.md"), "# ignoré");
  const url = pathToFileURL(dir + "/");
  const db = connect();
  const logs = []; const log = console.log; console.log = (...a) => logs.push(a.join(" "));
  try {
    await ingestFolder(db, { dir: url });
    await ingestFolder(db, { dir: url });
  } finally { console.log = log; }
  const rows = await db.q(`SELECT source, count(*)::int AS n FROM legal_chunks WHERE source IN ('loi-sur-les-baux','decret-test') GROUP BY source ORDER BY source`);
  assert.deepEqual(rows.map((r) => [r.source, r.n]), [["decret-test", 1], ["loi-sur-les-baux", 2]]);
  assert.equal(logs.filter((l) => l.includes("inchangé")).length, 2);
  assert.ok(logs.some((l) => l.includes("absents de textes/") && l.includes("code-travail")));
  ok("dossier textes/ : chargement, découpage, second passage sans réécriture");
  writeFileSync(join(dir, "doublon.json"), JSON.stringify({ source: "decret-test", title: "Autre", chunks: [{ text: "x" }] }));
  await assert.rejects(ingestFolder(db, { dir: url }), /déjà définie/);
  ok("dossier textes/ : source en double refusée");
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} vérifications réussies`);

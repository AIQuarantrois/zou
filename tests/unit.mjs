import assert from "node:assert/strict";
process.env.AUTH_SECRET = "k".repeat(40);
const { signSession, verifySession } = await import("../lib/auth.ts");
const { toTsQuery } = await import("../lib/ask.ts");

const t = signSession("11111111-1111-1111-1111-111111111111");
assert.equal(verifySession(t), "11111111-1111-1111-1111-111111111111");
assert.equal(verifySession(t + "x"), null);
const [h, p, s] = t.split(".");
assert.equal(verifySession(`${h}.${Buffer.from(JSON.stringify({ sub: "x", exp: 9999999999 })).toString("base64url")}.${s}`), null);
assert.equal(verifySession(t, Date.now() + 31 * 86400e3), null);
assert.equal(verifySession("a.b"), null);
console.log("  ok jetons de session : signature, altération, expiration");

assert.equal(toTsQuery("Combien de préavis pour une démission ?"), "preavis:* | demission:*");
assert.equal(toTsQuery("a'; DROP TABLE users; --"), "drop:* | table:* | users:*");
assert.equal(toTsQuery("à !! ?? "), "");
for (const part of toTsQuery("o'brien & (x) | y:* <-> z !w <script>").split(" | ")) assert.match(part, /^[a-z0-9]+:\*$/);
console.log("  ok requête plein texte : mots utiles, accents pliés, caractères sûrs");

const { parseText, slug, validateText } = await import("../lib/ingest.ts");
const t1 = parseText("Code du travail.txt", `﻿# Code du travail\r\n\r\nVu la Constitution,\r\n\r\nTITRE I\r\nDU CONTRAT DE TRAVAIL\r\n\r\nArticle premier.- Le présent code s'applique à tous les travailleurs.\r\n\r\nArt. 2 bis\r\nEst considéré comme travailleur toute personne\r\nqui s'est engagée à mettre son activité professionnelle.\r\nCHAPITRE II\r\nARTICLE 12-1 : Le contrat est écrit.\r\nl'article 13 du présent code ne crée pas d'article.\r\n`);
assert.equal(t1.source, "code-du-travail");
assert.equal(t1.title, "Code du travail");
assert.deepEqual(t1.chunks.map((c) => c.article), [null, "Art. premier", "Art. 2 bis", "Art. 12-1"]);
assert.equal(t1.chunks[0].text, "Vu la Constitution,");
assert.equal(t1.chunks[1].heading, "TITRE I — DU CONTRAT DE TRAVAIL");
assert.equal(t1.chunks[1].text, "Le présent code s'applique à tous les travailleurs.");
assert.match(t1.chunks[2].text, /^Est considéré[\s\S]*professionnelle\.$/);
assert.equal(t1.chunks[3].heading, "CHAPITRE II");
assert.match(t1.chunks[3].text, /Le contrat est écrit\.\nl'article 13/);
console.log("  ok découpage automatique : titre, articles, intitulés, préambule");

const long = "x".repeat(3500); // deux paragraphes tiennent dans 8 000 caractères, pas trois
const t2 = parseText("loi.md", `# Loi\nArticle 1\n${long}\n\n${long}\n\n${long}`);
assert.deepEqual(t2.chunks.map((c) => c.article), ["Art. 1", "Art. 1 (suite 1)"]);
assert.ok(t2.chunks.every((c) => c.text.length <= 8000));
const t3 = parseText("note.txt", "Note\n\nPremier paragraphe.\n\nSecond paragraphe.");
assert.deepEqual(t3.chunks, [{ article: null, heading: null, text: "Premier paragraphe.\n\nSecond paragraphe." }]);
assert.equal(slug("Décret n° 2024-123.txt"), "decret-n-2024-123");
assert.throws(() => parseText("vide.txt", " \n\n"), /vide/);
assert.throws(() => validateText({ source: "s", title: "t", chunks: [{ text: "" }] }), /text/);
assert.throws(() => validateText({ source: "s", title: "t", chunks: [] }), /articles/);
console.log("  ok découpage : articles longs coupés, texte sans article, validation");

const rec = parseText("recueil.txt", [
  "# Recueil foncier", "",
  "LOI n° 2008-013 du 23 juillet 2008", "sur le domaine public", "",
  "TITRE I", "DISPOSITIONS GENERALES", "",
  "Art. Premier : Le domaine public comprend les biens affectés à l'usage du public.",
  "Article 2. Il est inaliénable.", "",
  "DECRET N° 2008-1141 du 1er décembre 2008", "portant application de la loi 2008.013", "",
  "Vu la Constitution ;", "Vu la loi n° 2008-013 du 23 juillet 2008 sur le domaine public ;", "",
  "Article premier. Le présent décret fixe les modalités.",
  "Article 2. Il entre en vigueur dès sa publication.",
  "en application de la loi n° 2008-013 qui précède.",
].join("\n"));
assert.deepEqual(rec.chunks.map((c) => [c.article, c.heading]), [
  ["Art. Premier", "LOI n° 2008-013 du 23 juillet 2008 sur le domaine public · TITRE I — DISPOSITIONS GENERALES"],
  ["Art. 2", "LOI n° 2008-013 du 23 juillet 2008 sur le domaine public · TITRE I — DISPOSITIONS GENERALES"],
  [null, "DECRET N° 2008-1141 du 1er décembre 2008 portant application de la loi 2008.013"],
  ["Art. premier", "DECRET N° 2008-1141 du 1er décembre 2008 portant application de la loi 2008.013"],
  ["Art. 2", "DECRET N° 2008-1141 du 1er décembre 2008 portant application de la loi 2008.013"],
]);
assert.match(rec.chunks[4].text, /dès sa publication\.\nen application de la loi n° 2008-013 qui précède\./);
const single = parseText("loi.txt", "# Code\n\nLOI n° 2024-014\nportant Code du travail\n\nArticle premier. Champ.\nArticle 2. Suite.");
assert.deepEqual(single.chunks.map((c) => c.heading), [null, null, null]);
console.log("  ok recueil : chaque article rattaché à son texte ; texte unique sans répétition");

const spaced = parseText("commercant.txt", "# Statut\n\nARTICLE PREMIER : Objet du texte de loi modifié.\nArticle 1-1: Définition du commerçant.\nArticle 1- 3 : Actes de commerce par la forme.\nArticle2-3 : Incompatibilités prévues par un texte.");
assert.deepEqual(spaced.chunks.map((c) => [c.article, c.heading]), [["Art. PREMIER", null], ["Art. 1-1", null], ["Art. 1-3", null], ["Art. 2-3", null]]);
console.log("  ok numéros d'articles avec espace (« Article 1- 3 ») : reconnus, sans basculer en recueil");

// Tâches de base de données partagées par les scripts migrate / ingest / setup-db.
// Lancées avec « node --experimental-strip-types » (voir package.json) pour lire directement lib/*.ts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { applyMigrations } from "../lib/schema.ts";
import { IngestError, ingestText, parseText, validateText } from "../lib/ingest.ts";

export const TEXTES = new URL("../textes/", import.meta.url);

export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = new URL(`../${f}`, import.meta.url);
    if (existsSync(p)) process.loadEnvFile(p);
  }
}

export function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const sql = neon(url);
  return {
    q: (text, params = []) => sql.query(text, params),
    tx: (queries) => sql.transaction((t) => queries.map(([text, params]) => t.query(text, params))),
  };
}

export async function migrate(db) {
  const { applied, already } = await applyMigrations(db.q);
  console.log(applied.length ? `Migrations appliquées : ${applied.join(", ")}` : "Base à jour : aucune migration en attente.");
  if (already.length) console.log(`Déjà présentes : ${already.join(", ")}`);
}

/** Lit tous les textes du dossier textes/ : .json (déjà découpé) ou .txt / .md (découpé automatiquement). */
export function readTexts(dir = TEXTES) {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => /\.(json|txt|md)$/i.test(f) && !/^readme\.md$/i.test(f) && !f.startsWith(".")).sort();
  const texts = [];
  const seen = new Map();
  for (const f of files) {
    const raw = readFileSync(new URL(f, dir), "utf8");
    let t;
    try {
      t = /\.json$/i.test(f) ? validateText(JSON.parse(raw)) : parseText(f, raw);
    } catch (e) {
      throw new Error(`${f} : ${e instanceof IngestError || e instanceof SyntaxError ? e.message : e}`);
    }
    if (seen.has(t.source)) throw new Error(`${f} : la source « ${t.source} » est déjà définie par ${seen.get(t.source)}.`);
    seen.set(t.source, f);
    texts.push({ file: f, text: t });
  }
  return texts;
}

/** Charge les textes du dossier. Ceux qui n'ont pas changé depuis le dernier passage sont ignorés. */
export async function ingestFolder(db, { force = false, dryRun = false, dir = TEXTES } = {}) {
  const texts = readTexts(dir);
  if (!texts.length) {
    console.log("Aucun texte dans textes/ : rien à charger.");
    return;
  }
  for (const { file, text } of texts) {
    if (dryRun) {
      const arts = text.chunks.filter((c) => c.article).length;
      console.log(`- ${file} → « ${text.source} » : ${text.chunks.length} passage(s), dont ${arts} article(s) — ${text.title}`);
      continue;
    }
    const r = await ingestText(db, text, { force, origin: "fichier" });
    console.log(`- ${file} → « ${r.source} » : ${r.chunks} passage(s) ${r.status === "charge" ? "chargé(s)" : "inchangé(s)"}`);
  }
  if (dryRun) return;
  const known = new Set(texts.map((t) => t.text.source));
  const others = (await db.q(`SELECT source FROM legal_sources ORDER BY source`)).map((r) => String(r.source)).filter((s) => !known.has(s));
  if (others.length) console.log(`En base mais absents de textes/ (conservés) : ${others.join(", ")}`);
}

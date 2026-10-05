// Chargement des textes de loi dans legal_chunks. Partagé par la route d'administration et les scripts
// (scripts/ingest.mjs, scripts/setup-db.mjs) : aucun import interne, pour rester lisible par Node sans compilation.
import { createHash } from "node:crypto";

export type Chunk = { article: string | null; heading: string | null; text: string };
export type LegalText = { source: string; title: string; chunks: Chunk[] };
export type Db = {
  q: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  /** Exécute les requêtes dans une seule transaction : tout passe, ou rien. */
  tx: (queries: [string, unknown[]][]) => Promise<unknown>;
};

export const LIMITS = { source: 80, title: 200, article: 120, heading: 300, text: 8000, chunks: 5000 };

export class IngestError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

function clean(v: unknown, field: string, max: number, required: boolean): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new IngestError(field, `Champ « ${field} » requis.`);
    return null;
  }
  if (typeof v !== "string") throw new IngestError(field, `Champ « ${field} » : texte attendu.`);
  const s = v.replace(/\u0000/g, "").trim();
  if (!s) {
    if (required) throw new IngestError(field, `Champ « ${field} » requis.`);
    return null;
  }
  if (s.length > max) throw new IngestError(field, `Champ « ${field} » trop long (${s.length} > ${max}).`);
  return s;
}

/** Vérifie et normalise un texte { source, title, chunks: [{ article, heading, text }] }. */
export function validateText(v: any): LegalText {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new IngestError("text", "Objet { source, title, chunks } attendu.");
  const source = clean(v.source, "source", LIMITS.source, true)!;
  const title = clean(v.title, "title", LIMITS.title, true)!;
  if (!Array.isArray(v.chunks) || v.chunks.length === 0 || v.chunks.length > LIMITS.chunks) {
    throw new IngestError("chunks", `Entre 1 et ${LIMITS.chunks} articles attendus.`);
  }
  const chunks = v.chunks.map((c: any, i: number) => {
    if (!c || typeof c !== "object") throw new IngestError("chunks", `Article n° ${i + 1} invalide.`);
    return {
      article: clean(c.article, "article", LIMITS.article, false),
      heading: clean(c.heading, "heading", LIMITS.heading, false),
      text: clean(c.text, "text", LIMITS.text, true)!,
    };
  });
  return { source, title, chunks };
}

// ---------- Découpage automatique d'un texte brut (.txt / .md) ----------

// « Article 12 », « Art. 12 bis », « ARTICLE PREMIER », « Article 12-1 . - Texte… » (le texte peut suivre sur la même ligne).
const ARTICLE = /^\s*(?:#{1,6}\s*)?(?:\*\*)?((?:Art(?:icle)?|ART(?:ICLE)?)\.?\s*(?:premier|Premier|PREMIER|1er|1ER|\d+(?:[-.]\d+)*(?:\s*(?:bis|ter|quater|quinquies|sexies))?))(?:\*\*)?\s*(?:$|[.:\-–—°]+\s*(.*)$)/;
// « TITRE I », « Chapitre premier », « SECTION 2 »… : intitulé des articles qui suivent.
const HEADING = /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:LIVRE|TITRE|CHAPITRE|SECTION|SOUS-SECTION|Livre|Titre|Chapitre|Section|Sous-section)\s+(?:[IVXLC]+(?:er|ER)?|\d+|premier|Premier|PREMIER|unique|UNIQUE)\b/;
// « Loi n° 2008-013 du 23 juillet 2008… », « Décret n° 2010-233… » : début d'un nouveau texte dans un recueil.
const ACT = /^\s*[-–—_]*\s*(?:[IVX]+\.\d+\.?\s*)?((?:LOI|Loi|DÉCRET|DECRET|Décret|ORDONNANCE|Ordonnance|ARRÊTÉ|ARRETE|Arrêté)\b(?:\s+[\wéèê-]+)?\s*(?:[Nn]\s*[°º]\s*\d|\d{2,4}\s*[.\-–]\s*[\dO]{2,4}\b).*)$/;
const FIRST_ARTICLE = /^\s*(?:Art(?:icle)?|ART(?:ICLE)?)\.?\s*(?:premier|Premier|PREMIER|1er|1ER|1)\b(?![-.]\d)/;

/** Nom de fichier → identifiant de source : « Code du travail.txt » → « code-du-travail ». */
export function slug(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.source) || "texte";
}

/** Coupe un texte trop long en morceaux d'au plus `max` caractères, de préférence entre deux paragraphes. */
function split(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (cur && cur.length + 2 + p.length > max) { out.push(cur); cur = ""; }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    } else cur = cur ? cur + "\n\n" + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Découpe un texte de loi brut en articles. Le titre est la première ligne (« # Titre » accepté) ;
 * chaque ligne « Article 12 », « Art. 12 bis », « Article premier »… ouvre un nouvel article ;
 * les lignes LIVRE / TITRE / CHAPITRE / SECTION deviennent l'intitulé des articles qui suivent.
 * Sans aucun article repéré, le texte est découpé par paragraphes.
 */
export function parseText(filename: string, raw: string): LegalText {
  const lines = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  let i = lines.findIndex((l) => l.trim());
  if (i < 0) throw new IngestError("text", `${filename} : fichier vide.`);
  const title = lines[i].replace(/^#+\s*/, "").trim().slice(0, LIMITS.title);
  i++;

  // Recueil : plusieurs textes dont la numérotation recommence. Chaque article est alors rattaché à son texte
  // (« Loi n° 2008-013… · TITRE I — … »), sinon « Art. 5 » serait ambigu.
  const recueil = lines.slice(i).filter((l) => FIRST_ARTICLE.test(l)).length >= 2;

  const found: { article: string | null; heading: string | null; body: string[] }[] = [];
  let act: string | null = null;
  let heading: string | null = null;
  let extend: "heading" | "act" | null = null; // la ligne qui suit « TITRE I » ou « LOI N° … » en donne souvent l'objet
  let cur: (typeof found)[number] | null = null;
  let prev = "";
  const preamble: string[] = [];
  const label = () => (act && heading ? `${act} · ${heading}` : act || heading)?.slice(0, LIMITS.heading) ?? null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const art = line.match(ARTICLE);
    const actLine = recueil && !art && t.length <= 180 && !/\.{4,}|…{2,}/.test(t) && (!prev || /[.;:)»]$/.test(prev) || !/[a-zà-ÿ]/.test(prev) || extend !== null) ? line.match(ACT) : null;
    if (art) {
      cur = { article: art[1].replace(/\s+/g, " ").replace(/^art(?:icle)?\.?\s*/i, "Art. "), heading: label(), body: art[2] ? [art[2]] : [] };
      found.push(cur);
      extend = null;
    } else if (actLine) {
      act = actLine[1].replace(/\s+/g, " ").trim().slice(0, 200);
      heading = null;
      cur = null;
      extend = "act";
    } else if (HEADING.test(line)) {
      heading = line.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim().slice(0, LIMITS.heading);
      cur = null;
      extend = "heading";
    } else if (extend && t && t.length <= 150 && !/[.;]$/.test(t) && !/REPOBLIKAN|Tanindrazana|PRESIDENCE|PRIMATURE|MINIST[EÈ]RE|ASSEMBL[EÉ]E/i.test(t)) {
      if (extend === "heading") heading = `${heading} — ${t.replace(/\*\*/g, "")}`.slice(0, LIMITS.heading);
      else act = `${act} ${t}`.slice(0, 200);
      extend = null;
    } else {
      if (t) extend = null;
      // Texte entre un intitulé et le prochain article (exposé des motifs d'un texte du recueil…) : passage sans numéro.
      if (!cur && found.length) { cur = { article: null, heading: label(), body: [] }; found.push(cur); }
      if (cur) cur.body.push(line);
      else preamble.push(line);
    }
    if (t) prev = t;
  }

  const chunks: Chunk[] = [];
  if (!found.length) {
    for (const part of split(preamble.join("\n").trim(), 1500)) chunks.push({ article: null, heading: null, text: part });
  } else {
    const pre = preamble.join("\n").trim();
    if (pre) for (const part of split(pre, LIMITS.text)) chunks.push({ article: null, heading: null, text: part });
    for (const f of found) {
      const parts = split(f.body.join("\n").trim(), LIMITS.text);
      parts.forEach((text, n) => {
        // Un passage sans numéro très court n'est qu'un sous-titre isolé (« Classement. ») : rien à citer.
        if (!f.article && text.length < 40) return;
        if (text) chunks.push({ article: n === 0 || !f.article ? f.article : `${f.article} (suite ${n})`, heading: f.heading, text });
      });
    }
  }
  return validateText({ source: slug(filename), title, chunks });
}

// ---------- Écriture en base ----------

export function textHash(t: LegalText): string {
  return createHash("sha256").update(JSON.stringify([t.title, t.chunks])).digest("hex");
}

const BATCH = 500;

/**
 * Remplace la source par ce texte, dans une seule transaction : en cas d'échec, l'ancienne version reste en place.
 * Un texte identique à celui déjà chargé n'est pas réécrit (sauf `force`).
 */
export async function ingestText(db: Db, t: LegalText, o: { force?: boolean; origin?: string } = {}) {
  const hash = textHash(t);
  if (!o.force) {
    const prev = (await db.q(`SELECT hash FROM legal_sources WHERE source = $1`, [t.source]))[0];
    if (prev && prev.hash === hash) return { source: t.source, chunks: t.chunks.length, status: "inchange" as const };
  }
  const queries: [string, unknown[]][] = [[`DELETE FROM legal_chunks WHERE source = $1`, [t.source]]];
  for (let i = 0; i < t.chunks.length; i += BATCH) {
    const rows = t.chunks.slice(i, i + BATCH).map((c, j) => ({ article: c.article, heading: c.heading, body: c.text, position: i + j }));
    queries.push([
      `INSERT INTO legal_chunks (source, source_title, article, heading, body, position)
       SELECT $1, $2, x.article, x.heading, x.body, x.position
         FROM jsonb_to_recordset($3::jsonb) AS x(article text, heading text, body text, position int)`,
      [t.source, t.title, JSON.stringify(rows)],
    ]);
  }
  queries.push([
    `INSERT INTO legal_sources (source, title, hash, chunks, origin, ingested_at) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (source) DO UPDATE SET title = EXCLUDED.title, hash = EXCLUDED.hash, chunks = EXCLUDED.chunks,
       origin = EXCLUDED.origin, ingested_at = now()`,
    [t.source, t.title, hash, t.chunks.length, o.origin || "api"],
  ]);
  await db.tx(queries);
  return { source: t.source, chunks: t.chunks.length, status: "charge" as const };
}

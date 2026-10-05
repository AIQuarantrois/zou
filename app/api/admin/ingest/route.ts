import { api, json, body, ApiError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { q, tx } from "@/lib/db";
import { IngestError, ingestText, validateText } from "@/lib/ingest";

export const maxDuration = 60;

// Charge (ou remplace) un texte de loi découpé en articles : { source, title, chunks: [{ article, heading, text }], force? }.
// Remplacement atomique ; un texte identique à celui déjà en base n'est pas réécrit (sauf « force »).
// Pour un chargement automatique depuis le dossier textes/, voir scripts/ingest.mjs.
export const POST = api(async (req) => {
  requireAdmin(req);
  const b = await body(req, 4 * 1024 * 1024);
  let text;
  try { text = validateText(b); }
  catch (e) { if (e instanceof IngestError) throw new ApiError(400, "invalid_" + e.field, e.message); throw e; }
  const r = await ingestText({ q, tx }, text, { force: b.force === true, origin: "api" });
  return json({ ok: true, ...r });
});

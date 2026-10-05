import { api, json, sameOrigin, uuid, ipKey, ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { limit } from "@/lib/ratelimit";
import { DOC_COLS } from "@/lib/cols";
import { ALLOWED_TYPES, MAX_FILE_BYTES, QUOTA_BYTES, deleteFile, getFile, putFile } from "@/lib/blob";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Lit le corps brut en s'arrêtant dès que la limite est dépassée. */
async function readCapped(req: Request, max: number): Promise<ArrayBuffer> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > max) throw new ApiError(413, "file_too_large", "Fichier trop lourd (4 Mo au plus).");
  if (!req.body) throw new ApiError(400, "empty_file", "Fichier vide.");
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new ApiError(413, "file_too_large", "Fichier trop lourd (4 Mo au plus)."); }
    parts.push(value);
  }
  if (!size) throw new ApiError(400, "empty_file", "Fichier vide.");
  const out = new Uint8Array(size);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.byteLength; }
  return out.buffer;
}

// Joint (ou remplace) le fichier d'un document du coffre. Corps : le fichier brut, Content-Type = son type.
export const PUT = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  await limit("upload:" + u.id, 60, 3600);
  await limit(ipKey(req, "upload-ip"), 120, 3600);
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES[type]) throw new ApiError(415, "file_type_not_allowed", "Formats acceptés : PDF, photo (JPEG, PNG, WebP, HEIC) ou Word.");

  const doc = await one(`SELECT id, storage_key FROM documents WHERE id = $1 AND user_id = $2`, [id, u.id]);
  if (!doc) throw new ApiError(404, "not_found");
  const data = await readCapped(req, MAX_FILE_BYTES);
  const used = await one(
    `SELECT coalesce(sum(size_bytes), 0)::float8 AS n FROM documents WHERE user_id = $1 AND storage_key IS NOT NULL AND id <> $2`,
    [u.id, id]
  );
  if (Number(used?.n ?? 0) + data.byteLength > QUOTA_BYTES) throw new ApiError(413, "quota_exceeded", "Votre coffre est plein (200 Mo). Supprimez des fichiers pour en ajouter.");

  const key = await putFile(`coffre/${u.id}/${id}.${ALLOWED_TYPES[type]}`, data, type);
  const row = (await q(
    `UPDATE documents SET storage_key = $3, mime = $4, size_bytes = $5, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${DOC_COLS}`,
    [id, u.id, key, type, data.byteLength]
  ))[0];
  if (!row) { await deleteFile(key); throw new ApiError(404, "not_found"); } // document supprimé pendant l'envoi
  if (doc.storage_key && doc.storage_key !== key) await deleteFile(String(doc.storage_key));
  return json({ document: row });
});

// Télécharge le fichier, pour son propriétaire seulement. Toujours en pièce jointe : rien n'est interprété par le navigateur.
export const GET = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  const doc = await one(`SELECT title, mime, storage_key FROM documents WHERE id = $1 AND user_id = $2`, [id, u.id]);
  if (!doc || !doc.storage_key) throw new ApiError(404, "not_found", "Aucun fichier pour ce document.");
  const f = await getFile(String(doc.storage_key));
  if (!f || f.statusCode !== 200) throw new ApiError(404, "not_found", "Fichier introuvable.");
  const mime = String(doc.mime || f.blob.contentType || "application/octet-stream");
  const ext = ALLOWED_TYPES[mime];
  let name = String(doc.title).replace(/[\u0000-\u001f"\\/]/g, "_").slice(0, 150) || "document";
  if (ext && !name.toLowerCase().endsWith("." + ext)) name += "." + ext;
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "_");
  return new Response(f.stream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(f.blob.size),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

// Retire le fichier (le document et ses informations restent).
export const DELETE = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  const prev = await one(`SELECT storage_key FROM documents WHERE id = $1 AND user_id = $2`, [id, u.id]);
  if (!prev) throw new ApiError(404, "not_found");
  const row = (await q(`UPDATE documents SET storage_key = NULL, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${DOC_COLS}`, [id, u.id]))[0];
  await deleteFile(prev.storage_key ? String(prev.storage_key) : null);
  return json({ document: row });
});

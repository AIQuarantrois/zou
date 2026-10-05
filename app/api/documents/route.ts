import { api, json, body, sameOrigin, str, isoDate, uuid } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { intIn, optClientId } from "@/lib/crud";
import { DOC_COLS } from "@/lib/cols";

export const GET = api(async (req) => {
  const u = await requireUser(req);
  const rows = await q(`SELECT ${DOC_COLS} FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [u.id]);
  return json({ documents: rows });
});

export const POST = api(async (req) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const b = await body(req);
  const row = (await q(
    `INSERT INTO documents (user_id, case_id, client_id, title, kind, mime, size_bytes, expires_on, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO UPDATE SET updated_at = now()
     RETURNING ${DOC_COLS}`,
    [u.id, b.case_id ? uuid(b.case_id, "case_id") : null, optClientId(b.client_id), str(b.title, "title", { max: 200 }),
     str(b.kind, "kind", { max: 40, optional: true }) || "autre", str(b.mime, "mime", { max: 100, optional: true }) || null,
     b.size_bytes === undefined ? null : intIn(b.size_bytes, "size_bytes", 0, 1_000_000_000),
     b.expires_on ? isoDate(b.expires_on, "expires_on") : null, str(b.note, "note", { max: 1000, optional: true }) || null]
  ))[0];
  return json({ document: row }, 201);
});

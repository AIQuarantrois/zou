import { api, json, body, sameOrigin, str, isoDate, uuid, ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { patchParts } from "@/lib/crud";
import { DOC_COLS } from "@/lib/cols";
import { deleteFile } from "@/lib/blob";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  const b = await body(req);
  const { set, values } = patchParts({
    title: b.title === undefined ? undefined : str(b.title, "title", { max: 200 }),
    kind: b.kind === undefined ? undefined : str(b.kind, "kind", { max: 40 }),
    expires_on: b.expires_on === undefined ? undefined : (b.expires_on ? isoDate(b.expires_on, "expires_on") : null),
    note: b.note === undefined ? undefined : str(b.note, "note", { max: 1000, optional: true }) || null,
    case_id: b.case_id === undefined ? undefined : (b.case_id ? uuid(b.case_id, "case_id") : null),
  });
  const row = (await q(`UPDATE documents SET ${set}, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${DOC_COLS}`, [id, u.id, ...values]))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ document: row });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  const gone = await q(`DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING storage_key`, [id, u.id]);
  await deleteFile(gone[0]?.storage_key);
  return json({ ok: true });
});

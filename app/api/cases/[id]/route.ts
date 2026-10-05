import { api, json, body, sameOrigin, str, oneOf, uuid, ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { jsonObject, patchParts } from "@/lib/crud";
import { CASE_COLS } from "@/lib/cols";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  const row = (await q(`SELECT ${CASE_COLS} FROM cases WHERE id = $1 AND user_id = $2`, [id, u.id]))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ case: row });
});

export const PATCH = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  const b = await body(req);
  const { set, values } = patchParts({
    title: b.title === undefined ? undefined : str(b.title, "title", { max: 200 }),
    kind: b.kind === undefined ? undefined : str(b.kind, "kind", { max: 40 }),
    status: b.status === undefined ? undefined : oneOf(b.status, "status", ["open", "closed"] as const),
    data: b.data === undefined ? undefined : JSON.stringify(jsonObject(b.data, "data", 16000)),
  }, { data: "jsonb" });
  const row = (await q(`UPDATE cases SET ${set}, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${CASE_COLS}`, [id, u.id, ...values]))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ case: row });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  await q(`DELETE FROM cases WHERE id = $1 AND user_id = $2`, [id, u.id]);
  return json({ ok: true });
});

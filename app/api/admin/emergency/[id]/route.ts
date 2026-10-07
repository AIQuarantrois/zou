import { api, json, body, sameOrigin, str, uuid, ApiError } from "@/lib/http";
import { requireAdminSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { EMERGENCY_COLS } from "@/lib/cols";
import { intIn, patchParts } from "@/lib/crud";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  await requireAdminSession(req);
  const id = uuid((await ctx.params).id);
  const b = await body(req);
  const fields: Record<string, unknown> = {};
  if (b.label !== undefined) fields.label = str(b.label, "label", { max: 80 });
  if (b.phone !== undefined) fields.phone = str(b.phone, "phone", { max: 30 });
  if (b.description !== undefined) fields.description = str(b.description, "description", { max: 300, optional: true }) || null;
  if (b.sort_order !== undefined) fields.sort_order = intIn(b.sort_order, "sort_order", -999, 999);
  if (b.active !== undefined) fields.active = Boolean(b.active);
  const { set, values } = patchParts(fields, {}, 2);
  const row = (await q(
    `UPDATE emergency_contacts SET ${set}, updated_at = now() WHERE id = $1 RETURNING ${EMERGENCY_COLS}`,
    [id, ...values]
  ))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ contact: row });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  await requireAdminSession(req);
  const id = uuid((await ctx.params).id);
  const row = (await q(`DELETE FROM emergency_contacts WHERE id = $1 RETURNING id`, [id]))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ ok: true });
});

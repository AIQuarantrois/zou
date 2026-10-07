import { api, json, body, oneOf, uuid, ApiError } from "@/lib/http";
import { requireAdminAny } from "@/lib/auth";
import { q } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api(async (req, ctx: Ctx) => {
  await requireAdminAny(req);
  const id = uuid((await ctx.params).id);
  const row = (await q(`SELECT p.*, u.email FROM pros p JOIN users u ON u.id = p.user_id WHERE p.id = $1`, [id]))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ pro: row });
});

// Vérifie, rejette ou suspend une fiche professionnelle, et/ou change sa mise en avant.
export const PATCH = api(async (req, ctx: Ctx) => {
  await requireAdminAny(req);
  const id = uuid((await ctx.params).id);
  const b = await body(req, 2048);
  if (b.status === undefined && b.featured === undefined) throw new ApiError(400, "nothing_to_update", "Aucune modification fournie.");
  const status = b.status !== undefined ? oneOf(b.status, "status", ["pending", "verified", "rejected", "suspended"] as const) : null;
  const featured = b.featured !== undefined ? Boolean(b.featured) : null;
  const row = (await q(
    `UPDATE pros SET
       status = COALESCE($2, status),
       verified_at = CASE WHEN $2 = 'verified' THEN now() WHEN $2 IS NOT NULL THEN NULL ELSE verified_at END,
       featured = COALESCE($3, featured),
       updated_at = now()
     WHERE id = $1 RETURNING id, status, display_name, featured`,
    [id, status, featured]
  ))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ pro: row });
});

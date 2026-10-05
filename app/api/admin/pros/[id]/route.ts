import { api, json, body, oneOf, uuid, ApiError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// Vérifie, rejette ou suspend une fiche professionnelle.
export const PATCH = api(async (req, ctx: Ctx) => {
  requireAdmin(req);
  const id = uuid((await ctx.params).id);
  const b = await body(req, 2048);
  const status = oneOf(b.status, "status", ["pending", "verified", "rejected", "suspended"] as const);
  const row = (await q(
    `UPDATE pros SET status = $2, verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END, updated_at = now() WHERE id = $1 RETURNING id, status, display_name`,
    [id, status]
  ))[0];
  if (!row) throw new ApiError(404, "not_found");
  return json({ pro: row });
});

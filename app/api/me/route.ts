import { api, json, body, sameOrigin, str } from "@/lib/http";
import { currentUser, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { hasDb } from "@/lib/db";

export const GET = api(async (req) => {
  if (!hasDb()) return json({ user: null });
  const user = await currentUser(req);
  if (!user) return json({ user: null });
  const pro = (await q(`SELECT id, status, profession FROM pros WHERE user_id = $1`, [user.id]))[0] ?? null;
  return json({ user, pro });
});

export const PATCH = api(async (req) => {
  sameOrigin(req);
  const user = await requireUser(req);
  const b = await body(req);
  const name = b.name === undefined ? undefined : str(b.name, "name", { max: 120, optional: true }) || null;
  const phone = b.phone === undefined ? undefined : str(b.phone, "phone", { max: 30, optional: true }) || null;
  const rows = await q(
    `UPDATE users SET name = COALESCE($2, name), phone = COALESCE($3, phone) WHERE id = $1 RETURNING id, email, name, phone, locale`,
    [user.id, name ?? null, phone ?? null]
  );
  return json({ user: rows[0] });
});

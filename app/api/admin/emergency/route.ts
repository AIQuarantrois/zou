import { api, json, body, sameOrigin, str } from "@/lib/http";
import { requireAdminSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { EMERGENCY_COLS } from "@/lib/cols";
import { intIn } from "@/lib/crud";

// Backoffice : liste complète (actifs et inactifs), pour le tableau d'administration.
export const GET = api(async (req) => {
  await requireAdminSession(req);
  const rows = await q(`SELECT ${EMERGENCY_COLS} FROM emergency_contacts ORDER BY sort_order, label`);
  return json({ contacts: rows });
});

export const POST = api(async (req) => {
  sameOrigin(req);
  await requireAdminSession(req);
  const b = await body(req);
  const row = (await q(
    `INSERT INTO emergency_contacts (label, phone, description, sort_order, active)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${EMERGENCY_COLS}`,
    [
      str(b.label, "label", { max: 80 }),
      str(b.phone, "phone", { max: 30 }),
      str(b.description, "description", { max: 300, optional: true }) || null,
      b.sort_order === undefined ? 0 : intIn(b.sort_order, "sort_order", -999, 999),
      b.active === undefined ? true : Boolean(b.active),
    ]
  ))[0];
  return json({ contact: row }, 201);
});

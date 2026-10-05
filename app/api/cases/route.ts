import { api, json, body, sameOrigin, str, oneOf } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { jsonObject, optClientId } from "@/lib/crud";
import { CASE_COLS } from "@/lib/cols";

export const GET = api(async (req) => {
  const u = await requireUser(req);
  const rows = await q(`SELECT ${CASE_COLS} FROM cases WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 500`, [u.id]);
  return json({ cases: rows });
});

export const POST = api(async (req) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const b = await body(req);
  const row = (await q(
    `INSERT INTO cases (user_id, client_id, title, kind, status, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO UPDATE SET updated_at = now()
     RETURNING ${CASE_COLS}`,
    [u.id, optClientId(b.client_id), str(b.title, "title", { max: 200 }), str(b.kind, "kind", { max: 40, optional: true }) || "general",
     oneOf(b.status, "status", ["open", "closed"] as const, "open"), JSON.stringify(jsonObject(b.data, "data", 16000))]
  ))[0];
  return json({ case: row }, 201);
});

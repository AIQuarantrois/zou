import { api, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

export const GET = api(async (req) => {
  requireAdmin(req);
  const status = new URL(req.url).searchParams.get("status") || "pending";
  const rows = await q(
    `SELECT p.*, u.email FROM pros p JOIN users u ON u.id = p.user_id WHERE p.status = $1 ORDER BY p.created_at LIMIT 200`,
    [status]
  );
  return json({ pros: rows });
});

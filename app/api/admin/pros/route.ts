import { api, json, oneOf } from "@/lib/http";
import { requireAdminAny } from "@/lib/auth";
import { q } from "@/lib/db";

const STATUSES = ["pending", "verified", "rejected", "suspended", "all"] as const;

export const GET = api(async (req) => {
  await requireAdminAny(req);
  const status = oneOf(new URL(req.url).searchParams.get("status"), "status", STATUSES, "pending");
  // En attente : file, la plus ancienne demande d'abord. Les autres onglets : parcourir, la plus récente d'abord.
  const order = status === "pending" ? "p.created_at ASC" : "p.created_at DESC";
  const rows = await q(
    status === "all"
      ? `SELECT p.*, u.email FROM pros p JOIN users u ON u.id = p.user_id ORDER BY ${order} LIMIT 200`
      : `SELECT p.*, u.email FROM pros p JOIN users u ON u.id = p.user_id WHERE p.status = $1 ORDER BY ${order} LIMIT 200`,
    status === "all" ? [] : [status]
  );
  return json({ pros: rows });
});

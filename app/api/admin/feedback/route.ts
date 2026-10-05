import { api, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

// Lecture des retours sur les plans : GET /api/admin/feedback?kind=erreur|avis (jeton d'administration).
export const GET = api(async (req) => {
  requireAdmin(req);
  const kind = new URL(req.url).searchParams.get("kind");
  const rows = await q(
    `SELECT id, plan, kind, helpful, message, created_at FROM plan_feedback WHERE ($1::text IS NULL OR kind = $1) ORDER BY created_at DESC LIMIT 200`,
    [kind === "avis" || kind === "erreur" ? kind : null]
  );
  const stats = await q(
    `SELECT plan, count(*) FILTER (WHERE helpful) AS oui, count(*) FILTER (WHERE helpful = false) AS non, count(*) FILTER (WHERE kind = 'erreur') AS erreurs
       FROM plan_feedback GROUP BY plan ORDER BY plan`
  );
  return json({ feedback: rows, stats });
});

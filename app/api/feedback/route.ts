import { api, json, body, sameOrigin, str, oneOf, ipKey, ApiError } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { limit } from "@/lib/ratelimit";

// Avis sur un plan (« ce plan vous a-t-il aidé ? ») ou signalement d'une erreur. Accessible sans compte.
export const POST = api(async (req) => {
  sameOrigin(req);
  const b = await body(req, 8192);
  const plan = str(b.plan, "plan", { min: 1, max: 60 });
  if (!/^[a-z0-9.\-]+$/.test(plan)) throw new ApiError(400, "invalid_plan", "Plan inconnu.");
  const kind = oneOf(b.kind, "kind", ["avis", "erreur"] as const);
  let helpful: boolean | null = null;
  let message: string | null = null;
  if (kind === "avis") {
    if (typeof b.helpful !== "boolean") throw new ApiError(400, "invalid_helpful", "Indiquez si le plan vous a aidé.");
    helpful = b.helpful;
    message = str(b.message, "message", { max: 1500, optional: true }) || null;
  } else {
    message = str(b.message, "message", { min: 10, max: 1500 });
  }
  await limit(ipKey(req, "feedback"), 20, 3600);
  const user = await currentUser(req).catch(() => null);
  await q(`INSERT INTO plan_feedback (plan, kind, helpful, message, user_id) VALUES ($1,$2,$3,$4,$5)`, [plan, kind, helpful, message, user?.id ?? null]);
  return json({ ok: true }, 201);
});

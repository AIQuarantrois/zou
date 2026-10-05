import { api, json } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { applyMigrations } from "@/lib/schema";

// Applique les migrations en attente. Protégé par ADMIN_TOKEN (en-tête Authorization: Bearer …).
export const POST = api(async (req) => {
  requireAdmin(req);
  return json({ ok: true, ...(await applyMigrations(q)) });
});

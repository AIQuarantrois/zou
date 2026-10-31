import { api, json, sameOrigin } from "@/lib/http";
import { clearCookie, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";

// Déconnecte tous les appareils (téléphone perdu, ordinateur partagé) : les jetons déjà émis portent l'ancienne
// version de session et sont refusés dès la requête suivante. Cet appareil-ci est déconnecté aussi.
export const POST = api(async (req) => {
  sameOrigin(req);
  const u = await requireUser(req);
  await q(`UPDATE users SET session_version = session_version + 1 WHERE id = $1`, [u.id]);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
});

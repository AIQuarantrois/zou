import { api, json, body, email, ApiError } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

// Accorde ou retire le rôle administrateur (accès au backoffice). Protégé par le jeton bearer, pas par une
// session : c'est le mécanisme d'amorçage (il n'y a pas encore d'administrateur la première fois), et il reste
// le seul moyen de retirer son propre accès si besoin. Le compte doit déjà exister (se connecter une fois).
export const PATCH = api(async (req) => {
  requireAdmin(req);
  const b = await body(req, 2048);
  const addr = email(b.email);
  const isAdmin = Boolean(b.is_admin);
  const row = (await q(
    `UPDATE users SET is_admin = $2 WHERE lower(email) = lower($1) RETURNING id, email, is_admin`,
    [addr, isAdmin]
  ))[0];
  if (!row) throw new ApiError(404, "not_found", "Aucun compte avec cette adresse. Connectez-vous une première fois avec, puis réessayez.");
  return json({ user: row });
});

import { api, json, body, sameOrigin, str, ApiError } from "@/lib/http";
import { clearCookie, currentUser, requireUser } from "@/lib/auth";
import { q, tx } from "@/lib/db";
import { hasDb } from "@/lib/db";
import { deleteFiles } from "@/lib/blob";
import { patchParts } from "@/lib/crud";

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
  // Champ absent : inchangé ; vide ou nul : effacé.
  const { set, values } = patchParts({
    name: b.name === undefined ? undefined : str(b.name, "name", { max: 120, optional: true }) || null,
    phone: b.phone === undefined ? undefined : str(b.phone, "phone", { max: 30, optional: true }) || null,
  }, {}, 2);
  const rows = await q(`UPDATE users SET ${set} WHERE id = $1 RETURNING id, email, name, phone, locale`, [user.id, ...values]);
  return json({ user: rows[0] });
});

// Suppression définitive du compte, sur confirmation par l'adresse e-mail. Suivent en cascade : dossiers, échéances
// et rappels, documents, fiche professionnelle et sa boîte de réception. Partent aussi les codes de connexion et les
// messages envoyés au support. Restent, sans lien vers le compte : les avis sur les plans et les messages adressés à
// des professionnels (ils appartiennent à leur destinataire). Les fichiers du coffre sont effacés après la base : un
// fichier orphelin vaut mieux qu'un document encore listé dont le fichier aurait disparu.
export const DELETE = api(async (req) => {
  sameOrigin(req);
  const user = await requireUser(req);
  const b = await body(req, 2048);
  if (typeof b.confirm !== "string" || b.confirm.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError(400, "confirm_required", "Saisissez l'adresse e-mail du compte pour confirmer la suppression.");
  }
  const files = await q(`SELECT storage_key FROM documents WHERE user_id = $1 AND storage_key IS NOT NULL`, [user.id]);
  await tx([
    [`DELETE FROM contact_requests WHERE pro_id IS NULL AND from_user_id = $1`, [user.id]],
    [`DELETE FROM otp_codes WHERE lower(email) = lower($1)`, [user.email]],
    [`DELETE FROM users WHERE id = $1`, [user.id]],
  ]);
  await deleteFiles(files.map((f) => String(f.storage_key)));
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
});

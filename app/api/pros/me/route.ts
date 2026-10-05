import { api, json, body, sameOrigin, str, email, strArray, ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { patchParts } from "@/lib/crud";
import { PRO_OWN_COLS } from "@/lib/cols";

export const GET = api(async (req) => {
  const u = await requireUser(req);
  const pro = (await q(`SELECT ${PRO_OWN_COLS} FROM pros WHERE user_id = $1`, [u.id]))[0] ?? null;
  const inbox = pro
    ? await q(`SELECT id, name, reply_to, message, status, created_at FROM contact_requests WHERE pro_id = $1 ORDER BY created_at DESC LIMIT 100`, [pro.id])
    : [];
  return json({ pro, requests: inbox });
});

export const PATCH = api(async (req) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const b = await body(req);
  const { set, values } = patchParts({
    display_name: b.display_name === undefined ? undefined : str(b.display_name, "display_name", { max: 120 }),
    city: b.city === undefined ? undefined : str(b.city, "city", { max: 80 }),
    domains: b.domains === undefined ? undefined : strArray(b.domains, "domains", { maxItems: 12, maxLen: 40 }),
    languages: b.languages === undefined ? undefined : strArray(b.languages, "languages", { maxItems: 6, maxLen: 20 }),
    bio: b.bio === undefined ? undefined : str(b.bio, "bio", { max: 1500, optional: true }) || null,
    phone: b.phone === undefined ? undefined : str(b.phone, "phone", { max: 30, optional: true }) || null,
    public_email: b.public_email === undefined ? undefined : (b.public_email ? email(b.public_email, "public_email") : null),
  }, { domains: "text[]", languages: "text[]" }, 2);
  const row = (await q(`UPDATE pros SET ${set}, updated_at = now() WHERE user_id = $1 RETURNING ${PRO_OWN_COLS}`, [u.id, ...values]))[0];
  if (!row) throw new ApiError(404, "not_found", "Aucune fiche professionnelle.");
  return json({ pro: row });
});

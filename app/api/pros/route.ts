import { api, json, body, sameOrigin, str, email, oneOf, strArray, ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const PROFESSIONS = ["avocat", "notaire", "huissier", "conseil-juridique", "autre"] as const;

// Annuaire public : uniquement les professionnels dont le titre a été vérifié.
export const GET = api(async (req) => {
  const url = new URL(req.url);
  const profession = url.searchParams.get("profession");
  const city = (url.searchParams.get("city") || "").trim().slice(0, 80);
  const domain = (url.searchParams.get("domain") || "").trim().slice(0, 40);
  const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get("offset")) || 0));
  const where = [`status = 'verified'`];
  const params: unknown[] = [];
  if (profession && (PROFESSIONS as readonly string[]).includes(profession)) { params.push(profession); where.push(`profession = $${params.length}`); }
  if (city) { params.push(`%${city.replace(/[%_\\]/g, "")}%`); where.push(`city ILIKE $${params.length}`); }
  if (domain) { params.push(domain); where.push(`$${params.length} = ANY(domains)`); }
  params.push(offset);
  const rows = await q(
    `SELECT id, profession, display_name, city, domains, languages, registration_no, bio, phone, public_email, verified_at
       FROM pros WHERE ${where.join(" AND ")} ORDER BY display_name LIMIT 50 OFFSET $${params.length}`,
    params
  );
  return json({ pros: rows });
});

// Inscription d'un professionnel : nécessite un compte ; la fiche reste « en attente » jusqu'à vérification.
export const POST = api(async (req) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const b = await body(req);
  const exists = (await q(`SELECT 1 FROM pros WHERE user_id = $1`, [u.id]))[0];
  if (exists) throw new ApiError(409, "already_registered", "Vous avez déjà une fiche professionnelle.");
  const row = (await q(
    `INSERT INTO pros (user_id, profession, display_name, city, domains, languages, registration_no, bio, phone, public_email)
     VALUES ($1,$2,$3,$4,$5::text[],$6::text[],$7,$8,$9,$10)
     RETURNING id, status, profession, display_name, city`,
    [u.id, oneOf(b.profession, "profession", PROFESSIONS), str(b.display_name, "display_name", { max: 120 }), str(b.city, "city", { max: 80 }),
     strArray(b.domains, "domains", { maxItems: 12, maxLen: 40 }), b.languages ? strArray(b.languages, "languages", { maxItems: 6, maxLen: 20 }) : ["fr"],
     str(b.registration_no, "registration_no", { max: 60, optional: true }) || null, str(b.bio, "bio", { max: 1500, optional: true }) || null,
     str(b.phone, "phone", { max: 30, optional: true }) || null, b.public_email ? email(b.public_email, "public_email") : null]
  ))[0];
  return json({ pro: row }, 201);
});

// Colonnes renvoyées par l'API. Les dates sont renvoyées en texte AAAA-MM-JJ, quel que soit le fuseau du serveur.
export const CASE_COLS = `id, client_id, title, kind, status, data, created_at, updated_at`;
export const EVENT_COLS = `id, case_id, client_id, title, due_on::text AS due_on, remind_days, source, note, done, created_at, updated_at`;
export const DOC_COLS = `id, case_id, client_id, title, kind, mime, size_bytes::float8 AS size_bytes, expires_on::text AS expires_on, note, (storage_key IS NOT NULL) AS has_file, created_at, updated_at`;
export const PRO_OWN_COLS = `id, profession, display_name, city, domains, languages, registration_no, bio, phone, public_email, status, verified_at, created_at, updated_at`;

/** Date AAAA-MM-JJ à partir d'une valeur texte ou Date. */
export function day(v: unknown): string {
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
}

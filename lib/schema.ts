// Schéma de la base (Postgres / Neon). Chaque migration est appliquée une seule fois, dans l'ordre.
// Une instruction par entrée : le pilote HTTP de Neon n'exécute qu'une commande par requête.

export type Migration = { id: string; statements: string[] };

export const MIGRATIONS: Migration[] = [
  {
    id: "001_init",
    statements: [
      // Pliage des accents pour la recherche plein texte (les utilisateurs écrivent souvent sans accents).
      `CREATE OR REPLACE FUNCTION zou_fold(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $f$
         SELECT replace(replace(translate(lower(t),
           'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
           'aaaaaaceeeeiiiinooooouuuuyy'), 'œ', 'oe'), 'æ', 'ae')
       $f$`,

      `CREATE TABLE IF NOT EXISTS users (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         email text NOT NULL,
         name text,
         phone text,
         locale text NOT NULL DEFAULT 'fr',
         created_at timestamptz NOT NULL DEFAULT now(),
         last_login_at timestamptz
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email))`,

      `CREATE TABLE IF NOT EXISTS otp_codes (
         id bigserial PRIMARY KEY,
         email text NOT NULL,
         code_hash text NOT NULL,
         expires_at timestamptz NOT NULL,
         attempts int NOT NULL DEFAULT 0,
         consumed_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes (lower(email), created_at DESC)`,

      // Dossiers
      `CREATE TABLE IF NOT EXISTS cases (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         client_id text,
         title text NOT NULL,
         kind text NOT NULL DEFAULT 'general',
         status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
         data jsonb NOT NULL DEFAULT '{}'::jsonb,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS cases_client_key ON cases (user_id, client_id) WHERE client_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS cases_user_idx ON cases (user_id, updated_at DESC)`,

      // Coffre de documents (métadonnées ; le fichier lui-même ira dans un stockage objet)
      `CREATE TABLE IF NOT EXISTS documents (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
         client_id text,
         title text NOT NULL,
         kind text NOT NULL DEFAULT 'autre',
         mime text,
         size_bytes bigint,
         storage_key text,
         expires_on date,
         note text,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS documents_client_key ON documents (user_id, client_id) WHERE client_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id, created_at DESC)`,

      // Agenda : dates importantes
      `CREATE TABLE IF NOT EXISTS events (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         case_id uuid REFERENCES cases(id) ON DELETE SET NULL,
         client_id text,
         title text NOT NULL,
         due_on date NOT NULL,
         remind_days int[] NOT NULL DEFAULT '{7,1}',
         source text NOT NULL DEFAULT 'manual',
         note text,
         done boolean NOT NULL DEFAULT false,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS events_client_key ON events (user_id, client_id) WHERE client_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS events_user_due_idx ON events (user_id, due_on)`,

      // Rappels programmés (un par échéance de rappel)
      `CREATE TABLE IF NOT EXISTS reminders (
         id bigserial PRIMARY KEY,
         event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
         remind_on date NOT NULL,
         sent_at timestamptz,
         UNIQUE (event_id, remind_on)
       )`,
      `CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders (remind_on) WHERE sent_at IS NULL`,

      // Professionnels
      `CREATE TABLE IF NOT EXISTS pros (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
         profession text NOT NULL CHECK (profession IN ('avocat','notaire','huissier','conseil-juridique','autre')),
         display_name text NOT NULL,
         city text NOT NULL,
         domains text[] NOT NULL DEFAULT '{}',
         languages text[] NOT NULL DEFAULT '{fr}',
         registration_no text,
         bio text,
         phone text,
         public_email text,
         status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','suspended')),
         verified_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS pros_listing_idx ON pros (status, profession, city)`,

      // Demandes de contact (vers un professionnel) et messages au support (pro_id nul)
      `CREATE TABLE IF NOT EXISTS contact_requests (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         pro_id uuid REFERENCES pros(id) ON DELETE CASCADE,
         from_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
         name text NOT NULL,
         reply_to text NOT NULL,
         message text NOT NULL,
         topic text,
         status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','answered','spam')),
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS contact_requests_pro_idx ON contact_requests (pro_id, created_at DESC)`,

      // Textes de loi découpés par article, pour retrouver les passages avant de répondre
      `CREATE TABLE IF NOT EXISTS legal_chunks (
         id bigserial PRIMARY KEY,
         source text NOT NULL,
         source_title text NOT NULL,
         article text,
         heading text,
         body text NOT NULL,
         position int NOT NULL DEFAULT 0,
         tsv tsvector GENERATED ALWAYS AS (
           to_tsvector('french', zou_fold(coalesce(article,'') || ' ' || coalesce(heading,'') || ' ' || body))
         ) STORED,
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS legal_chunks_tsv_idx ON legal_chunks USING gin (tsv)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS legal_chunks_pos_key ON legal_chunks (source, position)`,

      // Limitation de débit, partagée entre les instances
      `CREATE TABLE IF NOT EXISTS rate_limits (
         key text NOT NULL,
         window_start timestamptz NOT NULL,
         hits int NOT NULL DEFAULT 1,
         PRIMARY KEY (key, window_start)
       )`,
    ],
  },
  {
    id: "002_legal_sources",
    statements: [
      // Une ligne par texte chargé : l'empreinte évite de réécrire un texte inchangé à chaque déploiement.
      `CREATE TABLE IF NOT EXISTS legal_sources (
         source text PRIMARY KEY,
         title text NOT NULL,
         hash text NOT NULL,
         chunks int NOT NULL,
         origin text NOT NULL DEFAULT 'api',
         ingested_at timestamptz NOT NULL DEFAULT now()
       )`,
      // Textes déjà chargés avant cette migration : empreinte vide, ils seront rechargés au prochain passage.
      `INSERT INTO legal_sources (source, title, hash, chunks)
       SELECT source, min(source_title), '', count(*)::int FROM legal_chunks GROUP BY source
       ON CONFLICT (source) DO NOTHING`,
    ],
  },
  {
    id: "003_plan_feedback",
    statements: [
      // Avis (« ce plan vous a-t-il aidé ? ») et signalements d'erreur sur les plans de l'application. Sans compte possible.
      `CREATE TABLE IF NOT EXISTS plan_feedback (
         id bigserial PRIMARY KEY,
         plan text NOT NULL,
         kind text NOT NULL CHECK (kind IN ('avis', 'erreur')),
         helpful boolean,
         message text,
         user_id uuid REFERENCES users(id) ON DELETE SET NULL,
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS plan_feedback_plan_idx ON plan_feedback (plan, created_at DESC)`,
    ],
  },
  {
    id: "004_admin_emergency",
    statements: [
      // Rôle d'administration, pour le backoffice (distinct du jeton bearer utilisé par les scripts et le cron).
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`,

      // Numéros utiles (secours, urgences vitales) : contenu piloté depuis le backoffice, jamais codé en dur.
      `CREATE TABLE IF NOT EXISTS emergency_contacts (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         label text NOT NULL,
         phone text NOT NULL,
         description text,
         sort_order int NOT NULL DEFAULT 0,
         active boolean NOT NULL DEFAULT true,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS emergency_contacts_public_idx ON emergency_contacts (active, sort_order)`,
    ],
  },
  {
    id: "005_pros_featured",
    statements: [
      // Mise en avant dans l'annuaire, pilotée depuis le backoffice (prépare la monétisation : lot 5).
      `ALTER TABLE pros ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false`,
    ],
  },
];

type Run = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Applique les migrations en attente avec la fonction de requête fournie (route d'administration ou script). */
export async function applyMigrations(run: Run) {
  await run(`CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await run(`SELECT id FROM schema_migrations`)).map((r) => String(r.id)));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    for (const s of m.statements) await run(s);
    await run(`INSERT INTO schema_migrations (id) VALUES ($1)`, [m.id]);
    applied.push(m.id);
  }
  return { applied, already: Array.from(done) };
}

import { api, json } from "@/lib/http";
import { capabilities, env } from "@/lib/env";
import { bearerMatches } from "@/lib/auth";
import { hasDb, one } from "@/lib/db";

// Public : seulement ce dont l'interface a besoin pour savoir quoi afficher. Le détail (jetons d'administration
// et de cron configurés, état de la base, taille du corpus) est réservé au jeton d'administration.
export const GET = api(async (req) => {
  const caps = capabilities();
  if (!bearerMatches(req, env.adminToken, 24)) {
    const { database, auth, ai, mail, files } = caps;
    return json({ status: "ok", service: "zou", capabilities: { database, auth, ai, mail, files } });
  }
  let db: "absent" | "ok" | "erreur" = "absent";
  let chunks: number | null = null;
  if (hasDb()) {
    try {
      const r = await one(`SELECT (SELECT count(*) FROM legal_chunks) AS chunks`);
      db = "ok"; chunks = Number(r?.chunks ?? 0);
    } catch {
      // base branchée mais schéma non appliqué, ou injoignable
      try { await one(`SELECT 1`); db = "ok"; } catch { db = "erreur"; }
    }
  }
  return json({ status: "ok", service: "zou", capabilities: caps, database: db, legal_chunks: chunks });
});

import { api, json } from "@/lib/http";
import { capabilities } from "@/lib/env";
import { hasDb, one } from "@/lib/db";

export const GET = api(async () => {
  const caps = capabilities();
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

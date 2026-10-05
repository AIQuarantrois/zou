// Charge en base les textes de loi du dossier textes/ (voir textes/README.md).
// Usage : npm run db:ingest            charge les textes nouveaux ou modifiés
//         npm run db:ingest -- --force recharge tout
//         npm run db:ingest -- --check vérifie le découpage, sans base de données
import { connect, ingestFolder, loadEnv } from "./db-tasks.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--check");
loadEnv();
const db = dryRun ? null : connect();
if (!dryRun && !db) {
  console.error("DATABASE_URL manquante : renseignez-la dans l'environnement, .env.local ou .env (ou utilisez --check).");
  process.exit(1);
}
try {
  await ingestFolder(db, { force: args.has("--force"), dryRun });
} catch (e) {
  console.error("Échec de l'ingestion :", e instanceof Error ? e.message : e);
  process.exit(1);
}

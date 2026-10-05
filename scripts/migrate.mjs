// Applique les migrations en attente directement sur la base, sans passer par l'API déployée.
// Usage : DATABASE_URL=postgres://… npm run db:migrate  (ou un fichier .env.local / .env à la racine)
import { connect, loadEnv, migrate } from "./db-tasks.mjs";

loadEnv();
const db = connect();
if (!db) {
  console.error("DATABASE_URL manquante : renseignez-la dans l'environnement, .env.local ou .env.");
  process.exit(1);
}
try {
  await migrate(db);
} catch (e) {
  console.error("Échec de la migration :", e instanceof Error ? e.message : e);
  process.exit(1);
}

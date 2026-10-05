// Lancé avant « next build » sur Vercel (script vercel-build) : applique les migrations puis charge les textes de textes/.
// Ainsi, ajouter ou modifier un fichier dans textes/ puis déployer suffit à mettre l'assistant à jour.
//  - sans DATABASE_URL : étape ignorée, le build continue ;
//  - déploiements de prévisualisation : ignorés, sauf ZOU_DB_SETUP=always (ex. base Neon dédiée par branche) ;
//  - ZOU_DB_SETUP=off : désactive complètement l'étape.
// Une erreur (texte mal formé, base injoignable) fait échouer le déploiement : rien n'est mis en ligne à moitié.
import { connect, ingestFolder, loadEnv, migrate } from "./db-tasks.mjs";

loadEnv();
const mode = process.env.ZOU_DB_SETUP || "auto";
const vercelEnv = process.env.VERCEL_ENV;
const skip = (why) => { console.log(`[zou] préparation de la base ignorée : ${why}.`); process.exit(0); };

if (mode === "off") skip("ZOU_DB_SETUP=off");
if (vercelEnv && vercelEnv !== "production" && mode !== "always") skip(`déploiement « ${vercelEnv} » (ZOU_DB_SETUP=always pour l'activer)`);
const db = connect();
if (!db) skip("DATABASE_URL absente");

try {
  console.log("[zou] migrations…");
  await migrate(db);
  console.log("[zou] textes de loi…");
  await ingestFolder(db);
} catch (e) {
  console.error("[zou] échec de la préparation de la base :", e instanceof Error ? e.message : e);
  process.exit(1);
}

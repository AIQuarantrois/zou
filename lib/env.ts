// Lecture des variables d'environnement. Rien n'est lu au chargement du module :
// l'application démarre et reste utilisable même si la base ou l'IA ne sont pas encore branchées.

export const env = {
  get databaseUrl() { return process.env.DATABASE_URL || ""; },
  get authSecret() { return process.env.AUTH_SECRET || ""; },
  get anthropicKey() { return process.env.ANTHROPIC_API_KEY || ""; },
  get anthropicModel() { return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"; },
  get resendKey() { return process.env.RESEND_API_KEY || ""; },
  get mailFrom() { return process.env.MAIL_FROM || ""; },
  get adminToken() { return process.env.ADMIN_TOKEN || ""; },
  get cronSecret() { return process.env.CRON_SECRET || ""; },
  // En développement uniquement : renvoie le code de connexion dans la réponse au lieu de l'envoyer.
  get devEcho() { return process.env.AUTH_DEV_ECHO === "1" && process.env.NODE_ENV !== "production"; },
  get blobToken() { return process.env.BLOB_READ_WRITE_TOKEN || ""; },
  get supportEmail() { return process.env.SUPPORT_EMAIL || ""; },
  get siteUrl() { return process.env.SITE_URL || ""; },
};

export function capabilities() {
  return {
    database: Boolean(env.databaseUrl),
    auth: Boolean(env.databaseUrl && env.authSecret.length >= 32),
    ai: Boolean(env.anthropicKey && env.databaseUrl),
    mail: Boolean(env.resendKey && env.mailFrom),
    files: Boolean(env.blobToken && env.databaseUrl),
    admin: env.adminToken.length >= 24,
    cron: env.cronSecret.length >= 16,
  };
}

import { env } from "./env";

export type Mail = { to: string; subject: string; text: string };

/** Envoie un e-mail via Resend (appel HTTP, aucune dépendance). Sans clé : rien n'est envoyé. */
export async function sendMail(m: Mail): Promise<boolean> {
  if (!env.resendKey || !env.mailFrom) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.mailFrom, to: [m.to], subject: m.subject, text: m.text }),
  });
  if (!r.ok) console.error("mail_failed", r.status);
  return r.ok;
}

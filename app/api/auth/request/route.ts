import { api, json, body, email, sameOrigin, ipKey } from "@/lib/http";
import { env } from "@/lib/env";
import { newCode, storeCode } from "@/lib/auth";
import { limit } from "@/lib/ratelimit";
import { sendMail } from "@/lib/mailer";
import { ApiError } from "@/lib/http";

// Demande d'un code de connexion à 6 chiffres, envoyé par e-mail. Même réponse que l'adresse existe ou non.
export const POST = api(async (req) => {
  sameOrigin(req);
  const b = await body(req, 2048);
  const addr = email(b.email);
  await limit(ipKey(req, "otp-ip"), 10, 3600);
  await limit("otp-mail:" + addr, 5, 3600);

  const code = newCode();
  await storeCode(addr, code);
  const sent = await sendMail({
    to: addr,
    subject: "Votre code de connexion ZOU",
    text: `Votre code de connexion ZOU : ${code}\n\nIl est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  });
  if (!sent && !env.devEcho) throw new ApiError(503, "mail_not_configured", "L'envoi des codes n'est pas encore activé.");
  return json({ ok: true, ...(env.devEcho ? { dev_code: code } : {}) });
});

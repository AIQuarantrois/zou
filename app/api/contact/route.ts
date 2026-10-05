import { api, json, body, sameOrigin, str, email, ipKey } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { limit } from "@/lib/ratelimit";
import { sendMail } from "@/lib/mailer";
import { env } from "@/lib/env";

// Message à l'équipe ZOU (formulaire de contact).
export const POST = api(async (req) => {
  sameOrigin(req);
  const b = await body(req, 8192);
  const name = str(b.name, "name", { max: 120 });
  const replyTo = email(b.email);
  const message = str(b.message, "message", { min: 10, max: 4000 });
  const topic = str(b.topic, "topic", { max: 60, optional: true }) || "support";
  await limit(ipKey(req, "contact"), 5, 3600);
  const user = await currentUser(req).catch(() => null);
  await q(`INSERT INTO contact_requests (pro_id, from_user_id, name, reply_to, message, topic) VALUES (NULL,$1,$2,$3,$4,$5)`, [user?.id ?? null, name, replyTo, message, topic]);
  if (env.supportEmail) await sendMail({ to: env.supportEmail, subject: `Contact ZOU : ${topic}`, text: `${name} <${replyTo}>\n\n${message}` }).catch(() => false);
  return json({ ok: true }, 201);
});

import { api, json, body, sameOrigin, str, uuid, ipKey, ApiError } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { limit } from "@/lib/ratelimit";
import { sendMail } from "@/lib/mailer";

type Ctx = { params: Promise<{ id: string }> };

// Demande de contact adressée à un professionnel vérifié. Possible sans compte.
export const POST = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const id = uuid((await ctx.params).id);
  const b = await body(req, 8192);
  const name = str(b.name, "name", { max: 120 });
  const replyTo = str(b.reply_to, "reply_to", { min: 5, max: 254 });
  const message = str(b.message, "message", { min: 10, max: 2000 });
  await limit(ipKey(req, "pro-contact"), 5, 3600);

  const pro = await one(
    `SELECT p.id, p.display_name, COALESCE(p.public_email, u.email) AS notify_to
       FROM pros p JOIN users u ON u.id = p.user_id WHERE p.id = $1 AND p.status = 'verified'`,
    [id]
  );
  if (!pro) throw new ApiError(404, "not_found", "Professionnel introuvable.");
  const user = await currentUser(req);
  await q(
    `INSERT INTO contact_requests (pro_id, from_user_id, name, reply_to, message, topic) VALUES ($1,$2,$3,$4,$5,'pro')`,
    [id, user?.id ?? null, name, replyTo, message]
  );
  await sendMail({
    to: String(pro.notify_to),
    subject: "Nouvelle demande de contact via ZOU",
    text: `${name} souhaite vous contacter.\n\nCoordonnées : ${replyTo}\n\n${message}\n\n— Message transmis par ZOU. Répondez directement à la personne.`,
  }).catch(() => false);
  return json({ ok: true }, 201);
});

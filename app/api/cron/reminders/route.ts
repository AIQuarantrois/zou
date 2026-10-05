import { api, json, ApiError } from "@/lib/http";
import { bearerMatches } from "@/lib/auth";
import { env, capabilities } from "@/lib/env";
import { q } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { purgeRateLimits } from "@/lib/ratelimit";

export const maxDuration = 60;

const FR_MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
function frDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${FR_MONTHS[m - 1]} ${y}`;
}

// Appelé chaque matin par Vercel Cron (en-tête Authorization: Bearer CRON_SECRET).
export const GET = api(async (req) => {
  if (!bearerMatches(req, env.cronSecret, 16)) throw new ApiError(401, "cron_only", "Accès réservé.");
  await purgeRateLimits();
  if (!capabilities().mail) return json({ ok: true, sent: 0, note: "mail_not_configured" });

  const due = await q(
    `SELECT r.id, r.remind_on::text AS remind_on, e.title, e.due_on::text AS due_on, u.email
       FROM reminders r JOIN events e ON e.id = r.event_id JOIN users u ON u.id = e.user_id
      WHERE r.sent_at IS NULL AND r.remind_on <= current_date AND e.done = false AND e.due_on >= current_date
      ORDER BY r.remind_on LIMIT 200`
  );
  let sent = 0;
  for (const r of due) {
    const ok = await sendMail({
      to: String(r.email),
      subject: `Rappel : ${r.title} — ${frDate(String(r.due_on))}`,
      text: `Rappel ZOU\n\n« ${r.title} » arrive à échéance le ${frDate(String(r.due_on))}.\n\nOuvrez ZOU pour voir le dossier et les démarches associées.`,
    });
    if (ok) { await q(`UPDATE reminders SET sent_at = now() WHERE id = $1`, [r.id]); sent++; }
  }
  return json({ ok: true, due: due.length, sent });
});

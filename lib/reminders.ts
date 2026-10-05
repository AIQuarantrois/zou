import { q } from "./db";

/** (Re)calcule les rappels d'une échéance : un par valeur de remind_days, aujourd'hui ou plus tard. */
export async function scheduleReminders(eventId: string, dueOn: string, remindDays: number[]) {
  await q(`DELETE FROM reminders WHERE event_id = $1 AND sent_at IS NULL`, [eventId]);
  for (const d of remindDays) {
    await q(
      `INSERT INTO reminders (event_id, remind_on)
       SELECT $1, ($2::date - $3::int)
        WHERE ($2::date - $3::int) >= current_date
       ON CONFLICT (event_id, remind_on) DO NOTHING`,
      [eventId, dueOn, d]
    );
  }
}

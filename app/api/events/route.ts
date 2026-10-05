import { api, json, body, sameOrigin, str, isoDate, intArray, uuid } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { optClientId } from "@/lib/crud";
import { scheduleReminders } from "@/lib/reminders";
import { EVENT_COLS, day } from "@/lib/cols";

export const GET = api(async (req) => {
  const u = await requireUser(req);
  const rows = await q(`SELECT ${EVENT_COLS} FROM events WHERE user_id = $1 ORDER BY due_on ASC LIMIT 500`, [u.id]);
  return json({ events: rows });
});

export const POST = api(async (req) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const b = await body(req);
  const dueOn = isoDate(b.due_on, "due_on");
  const remind = b.remind_days === undefined ? [7, 1] : intArray(b.remind_days, "remind_days", { maxItems: 6, min: 0, max: 365 });
  const row = (await q(
    `INSERT INTO events (user_id, case_id, client_id, title, due_on, remind_days, source, note)
     VALUES ($1, $2, $3, $4, $5, $6::int[], $7, $8)
     ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO UPDATE SET updated_at = now()
     RETURNING ${EVENT_COLS}`,
    [u.id, b.case_id ? uuid(b.case_id, "case_id") : null, optClientId(b.client_id), str(b.title, "title", { max: 200 }), dueOn, remind,
     str(b.source, "source", { max: 40, optional: true }) || "manual", str(b.note, "note", { max: 1000, optional: true }) || null]
  ))[0];
  await scheduleReminders(String(row.id), day(row.due_on), row.remind_days);
  return json({ event: row }, 201);
});

import { api, json, body, sameOrigin, str, isoDate, intArray, uuid, ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { patchParts } from "@/lib/crud";
import { scheduleReminders } from "@/lib/reminders";
import { EVENT_COLS, day } from "@/lib/cols";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  const b = await body(req);
  const { set, values } = patchParts({
    title: b.title === undefined ? undefined : str(b.title, "title", { max: 200 }),
    due_on: b.due_on === undefined ? undefined : isoDate(b.due_on, "due_on"),
    remind_days: b.remind_days === undefined ? undefined : intArray(b.remind_days, "remind_days", { maxItems: 6, min: 0, max: 365 }),
    note: b.note === undefined ? undefined : str(b.note, "note", { max: 1000, optional: true }) || null,
    done: b.done === undefined ? undefined : Boolean(b.done),
  }, { remind_days: "int[]", due_on: "date" });
  const row = (await q(
    `UPDATE events SET ${set}, updated_at = now()
      WHERE id = $1 AND user_id = $2 RETURNING ${EVENT_COLS}`,
    [id, u.id, ...values]
  ))[0];
  if (!row) throw new ApiError(404, "not_found");
  if (row.done) await q(`DELETE FROM reminders WHERE event_id = $1 AND sent_at IS NULL`, [id]);
  else await scheduleReminders(id, day(row.due_on), row.remind_days);
  return json({ event: row });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const id = uuid((await ctx.params).id);
  await q(`DELETE FROM events WHERE id = $1 AND user_id = $2`, [id, u.id]);
  return json({ ok: true });
});

import { api, json, body, sameOrigin, str, isoDate, intArray, oneOf, ApiError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { intIn, jsonObject, optClientId } from "@/lib/crud";
import { scheduleReminders } from "@/lib/reminders";
import { day } from "@/lib/cols";

// Importe ce qu'un invité a créé sur son appareil, une fois connecté. Idempotent grâce à client_id.
export const POST = api(async (req) => {
  sameOrigin(req);
  const u = await requireUser(req);
  const b = await body(req, 512 * 1024);
  const cases = Array.isArray(b.cases) ? b.cases : [];
  const events = Array.isArray(b.events) ? b.events : [];
  const docs = Array.isArray(b.documents) ? b.documents : [];
  if (cases.length > 200 || events.length > 500 || docs.length > 500) throw new ApiError(413, "too_many_items", "Trop d'éléments à importer.");

  const caseIds = new Map<string, string>();
  for (const c of cases) {
    const cid = optClientId(c?.client_id);
    if (!cid) continue;
    const r = (await q(
      `INSERT INTO cases (user_id, client_id, title, kind, status, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO UPDATE SET updated_at = cases.updated_at
       RETURNING id`,
      [u.id, cid, str(c.title, "title", { max: 200 }), str(c.kind, "kind", { max: 40, optional: true }) || "general",
       oneOf(c.status, "status", ["open", "closed"] as const, "open"), JSON.stringify(jsonObject(c.data, "data", 16000))]
    ))[0];
    caseIds.set(cid, String(r.id));
  }

  let nEvents = 0;
  for (const e of events) {
    const cid = optClientId(e?.client_id);
    if (!cid) continue;
    const remind = e.remind_days === undefined ? [7, 1] : intArray(e.remind_days, "remind_days", { maxItems: 6, min: 0, max: 365 });
    const r = (await q(
      `INSERT INTO events (user_id, case_id, client_id, title, due_on, remind_days, source, note, done)
       VALUES ($1,$2,$3,$4,$5,$6::int[],$7,$8,$9)
       ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO UPDATE SET updated_at = events.updated_at
       RETURNING id, due_on::text AS due_on, remind_days, done, (xmax = 0) AS inserted`,
      [u.id, e.case_client_id ? caseIds.get(String(e.case_client_id)) ?? null : null, cid, str(e.title, "title", { max: 200 }),
       isoDate(e.due_on, "due_on"), remind, str(e.source, "source", { max: 40, optional: true }) || "manual",
       str(e.note, "note", { max: 1000, optional: true }) || null, Boolean(e.done)]
    ))[0];
    if (r.inserted && !r.done) await scheduleReminders(String(r.id), day(r.due_on), r.remind_days);
    if (r.inserted) nEvents++;
  }

  let nDocs = 0;
  for (const d of docs) {
    const cid = optClientId(d?.client_id);
    if (!cid) continue;
    const r = (await q(
      `INSERT INTO documents (user_id, case_id, client_id, title, kind, mime, size_bytes, expires_on, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO NOTHING RETURNING id`,
      [u.id, d.case_client_id ? caseIds.get(String(d.case_client_id)) ?? null : null, cid, str(d.title, "title", { max: 200 }),
       str(d.kind, "kind", { max: 40, optional: true }) || "autre", str(d.mime, "mime", { max: 100, optional: true }) || null,
       d.size_bytes === undefined ? null : intIn(d.size_bytes, "size_bytes", 0, 1_000_000_000),
       d.expires_on ? isoDate(d.expires_on, "expires_on") : null, str(d.note, "note", { max: 1000, optional: true }) || null]
    ))[0];
    if (r) nDocs++;
  }
  return json({ ok: true, imported: { cases: caseIds.size, events: nEvents, documents: nDocs } });
});

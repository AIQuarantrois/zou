import { api, json } from "@/lib/http";
import { q } from "@/lib/db";

// Numéros utiles : public, sans compte. Seuls les numéros actifs, dans l'ordre choisi au backoffice.
export const GET = api(async () => {
  const rows = await q(`SELECT id, label, phone, description FROM emergency_contacts WHERE active ORDER BY sort_order, label`);
  return json({ contacts: rows });
});

import { q } from "@/lib/db";
import ProsAdmin from "./ProsAdmin";
import { STATUSES, type Status } from "./shared";

export default async function ProsPage() {
  const rows = await q(`SELECT status, count(*)::int AS n FROM pros GROUP BY status`);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const r of rows) counts[r.status as Status] = Number(r.n);

  return (
    <>
      <h1>Professionnels</h1>
      <p className="ad-lede">Avocats, notaires, huissiers et conseils juridiques inscrits à l'annuaire. Une fiche publiée doit avoir été vérifiée.</p>
      <ProsAdmin counts={counts} />
    </>
  );
}

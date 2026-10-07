import { q } from "@/lib/db";

export default async function AdminHome() {
  const [[{ n: pending }], [{ n: contacts }]] = await Promise.all([
    q(`SELECT count(*)::int AS n FROM pros WHERE status = 'pending'`),
    q(`SELECT count(*)::int AS n FROM emergency_contacts WHERE active`),
  ]);

  return (
    <>
      <h1>Backoffice</h1>
      <p className="ad-lede">Modération des professionnels et contenu piloté depuis cette interface.</p>
      <div className="ad-card">
        <a href="/admin/pros" className="ad-card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textDecoration: "none", color: "inherit" }}>
          <span>
            <strong style={{ display: "block", fontSize: 15 }}>Professionnels</strong>
            <span className="ad-t-sub">Vérifier, rejeter ou suspendre une fiche</span>
          </span>
          {Number(pending) > 0 ? <span className="ad-badge ad-badge-warn">{pending} en attente</span> : <span className="ad-badge ad-badge-ok">Aucune en attente</span>}
        </a>
      </div>
      <div className="ad-card">
        <a href="/admin/emergency" className="ad-card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textDecoration: "none", color: "inherit" }}>
          <span>
            <strong style={{ display: "block", fontSize: 15 }}>Numéros utiles</strong>
            <span className="ad-t-sub">Numéros de secours affichés dans l'application</span>
          </span>
          <span className="ad-badge">{contacts} actif{Number(contacts) === 1 ? "" : "s"}</span>
        </a>
      </div>
    </>
  );
}

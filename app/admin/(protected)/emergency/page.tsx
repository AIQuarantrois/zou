import EmergencyAdmin from "./EmergencyAdmin";

export default function EmergencyPage() {
  return (
    <>
      <h1>Numéros utiles</h1>
      <p className="ad-lede">Numéros de secours affichés dans l'application (page Urgence), même hors connexion. Seuls les numéros actifs sont visibles du public.</p>
      <EmergencyAdmin />
    </>
  );
}

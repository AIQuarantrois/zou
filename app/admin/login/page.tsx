import AdminLoginForm from "./AdminLoginForm";

// Un nonce de CSP est généré par requête (cf. middleware.ts) : cette page doit donc être rendue dynamiquement,
// jamais figée au moment du build (sans quoi ses scripts d'hydratation n'auraient aucun nonce valable).
export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return <AdminLoginForm />;
}

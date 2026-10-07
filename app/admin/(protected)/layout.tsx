import type { ReactNode } from "react";

// Ce sous-arbre dépend du cookie de session et du rôle de la personne connectée : jamais de rendu statique
// (sans quoi la page serait figée au moment du build et servie telle quelle à tout le monde en production).
export const dynamic = "force-dynamic";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userFromSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { hasDb } from "@/lib/db";
import { ADMIN_CSS } from "../styles";
import AdminShell from "./AdminShell";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  if (!hasDb()) {
    return (
      <div className="ad-denied">
        <style>{ADMIN_CSS}</style>
        <div className="ad-wrap">
          <h1>Backoffice</h1>
          <p className="ad-err">La base de données n'est pas encore connectée.</p>
        </div>
      </div>
    );
  }
  const jar = await cookies();
  const user = await userFromSessionToken(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect("/admin/login");
  if (!user.is_admin) {
    return (
      <div className="ad-denied">
        <style>{ADMIN_CSS}</style>
        <div className="ad-wrap">
          <h1>Accès réservé</h1>
          <p className="ad-lede">{user.email} n'a pas accès au backoffice. Demandez à un administrateur de vous l'accorder.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <style>{ADMIN_CSS}</style>
      <AdminShell email={user.email}>{children}</AdminShell>
    </>
  );
}

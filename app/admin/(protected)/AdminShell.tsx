"use client";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

const MODULES = [{ href: "/admin", label: "Accueil" }, { href: "/admin/emergency", label: "Numéros utiles" }];

export default function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <>
      <header className="ad-head">
        <strong>ZOU · Backoffice</strong>
        <span className="ad-who">
          {email} · <button className="ad-btn ad-btn-ghost" style={{ minHeight: 28, padding: "0 10px", fontSize: 13 }} onClick={logout}>Déconnexion</button>
        </span>
      </header>
      <nav className="ad-nav" aria-label="Modules du backoffice">
        {MODULES.map((m) => (
          <a key={m.href} href={m.href} data-on={pathname === m.href ? "true" : "false"} aria-current={pathname === m.href ? "page" : undefined}>{m.label}</a>
        ))}
      </nav>
      <main className="ad-main">{children}</main>
    </>
  );
}

"use client";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

const MODULES = [
  { href: "/admin", label: "Accueil" },
  { href: "/admin/pros", label: "Professionnels" },
  { href: "/admin/emergency", label: "Numéros utiles" },
];

export default function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/login");
    router.refresh();
  }

  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <div className="ad-shell">
      <header className="ad-head">
        <span className="ad-word">ZOU <small>Backoffice</small></span>
        <span className="ad-who">
          <span>{email}</span>
          <button className="ad-link" onClick={logout}>Déconnexion</button>
        </span>
      </header>
      <div className="ad-body">
        <nav className="ad-nav" aria-label="Modules du backoffice">
          {MODULES.map((m) => (
            <a key={m.href} href={m.href} aria-current={isActive(m.href) ? "page" : undefined}>{m.label}</a>
          ))}
        </nav>
        <main className="ad-main"><div className="ad-wrap">{children}</div></main>
      </div>
    </div>
  );
}

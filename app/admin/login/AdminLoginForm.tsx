"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_CSS } from "../styles";

// Connexion du backoffice : même code à 6 chiffres par e-mail que l'application publique (POST /api/auth/request
// puis /api/auth/verify, qui posent le même cookie de session). L'accès au backoffice lui-même dépend ensuite
// du rôle is_admin du compte, vérifié par app/admin/(protected)/layout.tsx.
export default function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error((d && d.message) || "Envoi impossible.");
      if (d && d.dev_code) setCode(d.dev_code);
      setStep("code");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error((d && d.message) || "Code incorrect.");
      router.replace("/admin");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Code incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ad-login-page">
      <style>{ADMIN_CSS}</style>
      <div className="ad-login">
        <h1>ZOU <small style={{ fontFamily: "var(--font-ui)", fontWeight: 500, fontSize: 15, color: "var(--ink-3)" }}>Backoffice</small></h1>
        <div className="ad-card">
          {step === "email" ? (
            <form onSubmit={sendCode} className="ad-card-pad">
              <div className="ad-field">
                <label htmlFor="ad-email">Adresse e-mail</label>
                <input id="ad-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {err && <p className="ad-err">{err}</p>}
              <button className="ad-btn" type="submit" disabled={busy}>Recevoir le code</button>
            </form>
          ) : (
            <form onSubmit={verify} className="ad-card-pad">
              <p className="ad-lede" style={{ margin: 0 }}>Code envoyé à {email}.</p>
              <div className="ad-field">
                <label htmlFor="ad-code">Code à 6 chiffres</label>
                <input id="ad-code" inputMode="numeric" pattern="[0-9]{6}" required autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </div>
              {err && <p className="ad-err">{err}</p>}
              <button className="ad-btn" type="submit" disabled={busy || code.length !== 6}>Se connecter</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

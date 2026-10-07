"use client";
import { useState } from "react";
import { useToast, ToastHost } from "../../../Toast";
import { PROFESSION_LABELS, STATUS_LABELS, STATUS_BADGE, fmtDate, type Pro, type Status } from "../shared";

const TRANSITIONS: Record<Status, { to: Status; label: string; cls: string }[]> = {
  pending: [{ to: "verified", label: "Vérifier", cls: "ad-btn" }, { to: "rejected", label: "Rejeter", cls: "ad-btn-danger" }],
  verified: [{ to: "suspended", label: "Suspendre", cls: "ad-btn-ghost" }, { to: "rejected", label: "Rejeter", cls: "ad-btn-danger" }],
  rejected: [{ to: "verified", label: "Vérifier", cls: "ad-btn" }],
  suspended: [{ to: "verified", label: "Réactiver", cls: "ad-btn" }, { to: "rejected", label: "Rejeter", cls: "ad-btn-danger" }],
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="ad-t-sub" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15 }}>{value || "—"}</div>
    </div>
  );
}

export default function ProDetail({ initial }: { initial: Pro }) {
  const [pro, setPro] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { toasts, show } = useToast();

  async function patch(payload: Record<string, unknown>, okMessage: string) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/admin/pros/${pro.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error((d && d.message) || "La modification a échoué.");
      setPro((p) => ({ ...p, ...d.pro }));
      show(okMessage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "La modification a échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <a href="/admin/pros" className="ad-link" style={{ display: "inline-block", marginBottom: 20 }}>← Professionnels</a>

      <div className="ad-eyebrow">{PROFESSION_LABELS[pro.profession] || pro.profession}</div>
      <div className="ad-row" style={{ marginBottom: 6, alignItems: "baseline" }}>
        <h1 style={{ marginBottom: 0 }}>{pro.display_name}</h1>
        <span className={`ad-badge ${STATUS_BADGE[pro.status]}`}>{STATUS_LABELS[pro.status]}</span>
        {pro.featured && <span className="ad-badge ad-badge-ok">Mise en avant</span>}
      </div>
      <p className="ad-lede">{pro.city} · Inscrite le {fmtDate(pro.created_at)}{pro.verified_at ? ` · Vérifiée le ${fmtDate(pro.verified_at)}` : ""}</p>

      {err && <p className="ad-err" style={{ marginBottom: 16 }}>{err}</p>}

      <div className="ad-section">
        <div className="ad-section-head"><h2>Actions</h2></div>
        <div className="ad-card ad-card-pad">
          <div className="ad-row">
            {TRANSITIONS[pro.status].map((t) => (
              <button key={t.to} type="button" className={`ad-btn ${t.cls}`} disabled={busy}
                onClick={() => patch({ status: t.to }, t.to === "verified" ? "Fiche vérifiée." : t.to === "rejected" ? "Fiche rejetée." : "Fiche suspendue.")}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ad-check" style={{ marginTop: 16 }}>
            <input id="pro-featured" type="checkbox" checked={pro.featured} disabled={busy}
              onChange={(e) => patch({ featured: e.target.checked }, e.target.checked ? "Mise en avant." : "Retirée de la mise en avant.")} />
            <label htmlFor="pro-featured" style={{ fontSize: 15, fontWeight: 400 }}>Mettre en avant dans l'annuaire</label>
          </div>
        </div>
      </div>

      <div className="ad-section">
        <div className="ad-section-head"><h2>Informations</h2></div>
        <div className="ad-card ad-card-pad">
          <div className="ad-grid-2" style={{ rowGap: 20 }}>
            <Field label="Numéro d'inscription" value={pro.registration_no} />
            <Field label="Téléphone" value={pro.phone} />
            <Field label="E-mail public" value={pro.public_email} />
            <Field label="E-mail du compte" value={pro.email} />
            <Field label="Langues" value={pro.languages?.join(", ")} />
            <Field label="Domaines" value={pro.domains?.join(", ")} />
          </div>
        </div>
      </div>

      {pro.bio && (
        <div className="ad-section">
          <div className="ad-section-head"><h2>Présentation</h2></div>
          <div className="ad-card ad-card-pad">
            <p style={{ margin: 0, whiteSpace: "pre-line", lineHeight: 1.6 }}>{pro.bio}</p>
          </div>
        </div>
      )}

      <ToastHost toasts={toasts} />
    </div>
  );
}

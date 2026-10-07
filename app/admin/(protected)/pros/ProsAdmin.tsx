"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PROFESSION_LABELS, STATUS_LABELS, STATUS_BADGE, STATUSES, fmtDate, type Pro, type Status } from "./shared";

const TABS: { key: Status | "all"; label: string }[] = [
  { key: "pending", label: "En attente" },
  { key: "verified", label: "Vérifiées" },
  { key: "rejected", label: "Rejetées" },
  { key: "suspended", label: "Suspendues" },
  { key: "all", label: "Toutes" },
];

export default function ProsAdmin({ counts }: { counts: Record<Status, number> }) {
  const router = useRouter();
  const [tab, setTab] = useState<Status | "all">("pending");
  const [pros, setPros] = useState<Pro[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setPros(null);
    fetch(`/api/admin/pros?status=${tab}`)
      .then((r) => r.json())
      .then((d) => setPros(d.pros))
      .catch(() => setErr("Impossible de charger les fiches."));
  }, [tab]);

  const total = STATUSES.reduce((n, s) => n + counts[s], 0);

  return (
    <div>
      <div className="ad-seg" role="tablist" aria-label="Filtrer par statut">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="ad-seg-count">{t.key === "all" ? total : counts[t.key]}</span>
          </button>
        ))}
      </div>

      {err && <p className="ad-err" style={{ marginTop: 16 }}>{err}</p>}

      <div className="ad-card" style={{ marginTop: 16 }}>
        {pros === null ? (
          <div className="ad-card-pad"><div className="ad-skel" /></div>
        ) : pros.length === 0 ? (
          <p className="ad-empty">{tab === "pending" ? "Aucune fiche en attente." : "Aucune fiche dans cette catégorie."}</p>
        ) : (
          <table className="ad-table">
            <thead>
              <tr><th>Professionnel</th><th>Domaines</th><th>Inscrit le</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {pros.map((p) => (
                <tr key={p.id} className="is-link" onClick={() => router.push(`/admin/pros/${p.id}`)}>
                  <td>
                    <a href={`/admin/pros/${p.id}`} className="ad-t-main" style={{ display: "block", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                      {p.display_name}{p.featured && " ★"}
                    </a>
                    <div className="ad-t-sub">{PROFESSION_LABELS[p.profession] || p.profession} · {p.city}</div>
                  </td>
                  <td className="ad-t-sub">{p.domains.slice(0, 3).join(", ") || "—"}</td>
                  <td className="ad-t-sub">{fmtDate(p.created_at)}</td>
                  <td><span className={`ad-badge ${STATUS_BADGE[p.status]}`}>{STATUS_LABELS[p.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

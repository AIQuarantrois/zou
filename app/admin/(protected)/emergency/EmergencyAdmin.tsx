"use client";
import { useEffect, useState } from "react";
import { useToast, ToastHost } from "../../Toast";

type Contact = { id: string; label: string; phone: string; description: string | null; sort_order: number; active: boolean };
type Form = { label: string; phone: string; description: string; sort_order: string; active: boolean };
const EMPTY_FORM: Form = { label: "", phone: "", description: "", sort_order: "0", active: true };

async function call(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error((d && d.message) || "La requête a échoué.");
  return d;
}

export default function EmergencyAdmin() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const { toasts, show, runUndoable } = useToast();

  function load() {
    call("/api/admin/emergency").then((d) => setContacts(d.contacts)).catch((e) => setErr(e.message));
  }
  useEffect(load, []);

  function startEdit(c?: Contact) {
    setErr("");
    if (c) { setEditingId(c.id); setForm({ label: c.label, phone: c.phone, description: c.description || "", sort_order: String(c.sort_order), active: c.active }); }
    else { setEditingId("new"); setForm(EMPTY_FORM); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const payload = {
      label: form.label, phone: form.phone, description: form.description || null,
      sort_order: Number(form.sort_order) || 0, active: form.active,
    };
    const creating = editingId === "new";
    try {
      if (creating) await call("/api/admin/emergency", { method: "POST", body: JSON.stringify(payload) });
      else await call(`/api/admin/emergency/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditingId(null);
      load();
      show(creating ? "Numéro ajouté." : "Numéro modifié.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  function remove(c: Contact) {
    const at = contacts ? contacts.findIndex((x) => x.id === c.id) : -1;
    setContacts((cs) => (cs ? cs.filter((x) => x.id !== c.id) : cs));
    runUndoable(
      `« ${c.label} » supprimé.`,
      () => { call(`/api/admin/emergency/${c.id}`, { method: "DELETE" }).catch(() => { setErr("Suppression impossible."); load(); }); },
      () => { setContacts((cs) => { if (!cs) return cs; const next = cs.slice(); next.splice(Math.max(at, 0), 0, c); return next; }); }
    );
  }

  return (
    <div>
      {err && <p className="ad-err" style={{ marginBottom: 16 }}>{err}</p>}
      <div className="ad-section">
        <div className="ad-section-head">
          <h2>{contacts ? contacts.length : "—"} numéro{contacts?.length === 1 ? "" : "s"}</h2>
        </div>
        <div className="ad-card">
          {contacts === null ? (
            <div className="ad-card-pad"><div className="ad-skel" /></div>
          ) : contacts.length === 0 ? (
            <p className="ad-empty">Aucun numéro pour l'instant.</p>
          ) : (
            <table className="ad-table">
              <thead>
                <tr><th>Numéro</th><th>Ordre</th><th>État</th><th /></tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="ad-t-main">{c.label} · {c.phone}</div>
                      {c.description && <div className="ad-t-sub">{c.description}</div>}
                    </td>
                    <td>{c.sort_order}</td>
                    <td>{c.active ? <span className="ad-badge ad-badge-ok">Visible</span> : <span className="ad-badge">Masqué</span>}</td>
                    <td>
                      <div className="ad-row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                        <button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => startEdit(c)}>Modifier</button>
                        <button className="ad-btn ad-btn-danger ad-btn-sm" onClick={() => remove(c)}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="ad-section">
        {editingId === null ? (
          <button className="ad-btn" onClick={() => startEdit()}>Ajouter un numéro</button>
        ) : (
          <form onSubmit={save} className="ad-card ad-card-pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <h2 className="ad-eyebrow" style={{ margin: 0 }}>{editingId === "new" ? "Nouveau numéro" : "Modifier le numéro"}</h2>
            <div className="ad-grid-2">
              <div className="ad-field">
                <label htmlFor="em-label">Libellé</label>
                <input id="em-label" required maxLength={80} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Police" />
              </div>
              <div className="ad-field">
                <label htmlFor="em-phone">Numéro</label>
                <input id="em-phone" required maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="117" />
              </div>
            </div>
            <div className="ad-field">
              <label htmlFor="em-desc">Description (facultative)</label>
              <input id="em-desc" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Police nationale" />
            </div>
            <div className="ad-grid-2">
              <div className="ad-field">
                <label htmlFor="em-order">Ordre d'affichage</label>
                <input id="em-order" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
              </div>
              <div className="ad-check" style={{ alignSelf: "end", paddingBottom: 10 }}>
                <input id="em-active" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <label htmlFor="em-active" style={{ fontSize: 15, fontWeight: 400 }}>Visible dans l'application</label>
              </div>
            </div>
            <div className="ad-row">
              <button className="ad-btn" type="submit" disabled={busy}>Enregistrer</button>
              <button className="ad-btn ad-btn-ghost" type="button" onClick={() => setEditingId(null)} disabled={busy}>Annuler</button>
            </div>
          </form>
        )}
      </div>
      <ToastHost toasts={toasts} />
    </div>
  );
}

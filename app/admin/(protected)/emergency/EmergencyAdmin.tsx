"use client";
import { useEffect, useState } from "react";

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
    try {
      if (editingId === "new") await call("/api/admin/emergency", { method: "POST", body: JSON.stringify(payload) });
      else await call(`/api/admin/emergency/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      setEditingId(null);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Supprimer « ${label} » ? Ce numéro ne sera plus visible dans l'application.`)) return;
    setBusy(true); setErr("");
    try {
      await call(`/api/admin/emergency/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <p className="ad-err">{err}</p>}
      <div className="ad-card">
        {contacts === null ? (
          <p className="ad-empty">Chargement…</p>
        ) : contacts.length === 0 ? (
          <p className="ad-empty">Aucun numéro pour l'instant.</p>
        ) : (
          <table className="ad-table">
            <thead>
              <tr><th>Libellé</th><th>Numéro</th><th>Ordre</th><th>État</th><th /></tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}{c.description ? <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{c.description}</div> : null}</td>
                  <td>{c.phone}</td>
                  <td>{c.sort_order}</td>
                  <td><span className="ad-badge" data-on={c.active ? "true" : "false"}>{c.active ? "Visible" : "Masqué"}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="ad-btn ad-btn-ghost" style={{ minHeight: 32, padding: "0 10px", fontSize: 13 }} onClick={() => startEdit(c)}>Modifier</button>{" "}
                    <button className="ad-btn ad-btn-danger" style={{ minHeight: 32, padding: "0 10px", fontSize: 13 }} onClick={() => remove(c.id, c.label)} disabled={busy}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingId === null ? (
        <button className="ad-btn" style={{ alignSelf: "flex-start" }} onClick={() => startEdit()}>Ajouter un numéro</button>
      ) : (
        <form onSubmit={save} className="ad-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <strong>{editingId === "new" ? "Nouveau numéro" : "Modifier le numéro"}</strong>
          <div className="ad-row">
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
          <div className="ad-row">
            <div className="ad-field">
              <label htmlFor="em-order">Ordre d'affichage</label>
              <input id="em-order" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div className="ad-field">
              <label htmlFor="em-active">Visible dans l'application</label>
              <input id="em-active" type="checkbox" style={{ width: 20, height: 20 }} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            </div>
          </div>
          <div className="ad-row" style={{ flex: "none" }}>
            <button className="ad-btn" type="submit" disabled={busy}>Enregistrer</button>
            <button className="ad-btn ad-btn-ghost" type="button" onClick={() => setEditingId(null)} disabled={busy}>Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}

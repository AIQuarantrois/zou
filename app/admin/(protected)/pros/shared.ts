export const PROFESSION_LABELS: Record<string, string> = {
  avocat: "Avocat", notaire: "Notaire", huissier: "Huissier", "conseil-juridique": "Conseil juridique", autre: "Autre",
};
export const STATUSES = ["pending", "verified", "rejected", "suspended"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = { pending: "En attente", verified: "Vérifiée", rejected: "Rejetée", suspended: "Suspendue" };
export const STATUS_BADGE: Record<Status, string> = { pending: "ad-badge-warn", verified: "ad-badge-ok", rejected: "ad-badge-danger", suspended: "ad-badge-danger" };

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export type Pro = {
  id: string; profession: string; display_name: string; city: string; domains: string[]; languages: string[];
  registration_no: string | null; bio: string | null; phone: string | null; public_email: string | null;
  status: Status; featured: boolean; verified_at: string | null; created_at: string; email: string;
};

import { ApiError, uuid } from "./http";
import { one } from "./db";

/** Construit « col = $n » pour un UPDATE partiel à partir des champs réellement fournis. */
export function patchParts(fields: Record<string, unknown>, casts: Record<string, string> = {}, firstParam = 3) {
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (!keys.length) throw new ApiError(400, "nothing_to_update", "Aucune modification fournie.");
  const set = keys.map((k, i) => `${k} = $${firstParam + i}${casts[k] ? "::" + casts[k] : ""}`).join(", ");
  return { set, values: keys.map((k) => fields[k]) };
}

export function jsonObject(v: unknown, name: string, maxChars: number): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new ApiError(400, "invalid_" + name);
  if (JSON.stringify(v).length > maxChars) throw new ApiError(400, "invalid_" + name, "Données trop volumineuses.");
  return v as Record<string, unknown>;
}

export function intIn(v: unknown, name: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, "invalid_" + name);
  return n;
}

/** Dossier de rattachement : absent → null ; sinon un dossier du même compte, jamais celui d'un autre. */
export async function ownCaseId(v: unknown, userId: string): Promise<string | null> {
  if (!v) return null;
  const id = uuid(v, "case_id");
  if (!(await one(`SELECT 1 FROM cases WHERE id = $1 AND user_id = $2`, [id, userId]))) throw new ApiError(400, "invalid_case_id", "Dossier introuvable.");
  return id;
}

export function optClientId(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 64) throw new ApiError(400, "invalid_client_id");
  return v;
}

import { createHmac } from "node:crypto";
import { env } from "./env";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...extra },
  });
}

/** Enveloppe commune : erreurs typées, jamais de détail interne dans les réponses. */
export function api(handler: (req: Request, ctx: any) => Promise<Response>) {
  return async (req: Request, ctx: any) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.code, message: e.message }, e.status);
      console.error("api_error", e);
      return json({ error: "server_error", message: "Une erreur est survenue. Réessayez dans un instant." }, 500);
    }
  };
}

/** Lit un corps JSON limité en taille. */
export async function body(req: Request, maxBytes = 64 * 1024): Promise<Record<string, any>> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) throw new ApiError(415, "json_required", "Corps JSON attendu.");
  const raw = await req.text();
  if (raw.length > maxBytes) throw new ApiError(413, "too_large", "Requête trop volumineuse.");
  try {
    const v = JSON.parse(raw || "{}");
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw 0;
    return v;
  } catch {
    throw new ApiError(400, "bad_json", "JSON invalide.");
  }
}

/** Refuse les requêtes qui modifient des données depuis une autre origine (protection CSRF en plus de SameSite). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // appels serveur à serveur, curl : pas d'origine
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  let o = "";
  try { o = new URL(origin).host; } catch { throw new ApiError(403, "bad_origin"); }
  if (o !== host) throw new ApiError(403, "bad_origin", "Origine non autorisée.");
}

export function clientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return (xf ? xf.split(",")[0] : req.headers.get("x-real-ip") || "0.0.0.0").trim();
}

/** Empreinte de l'IP : on ne stocke jamais l'adresse en clair. */
export function ipKey(req: Request, scope: string) {
  const secret = env.authSecret || "zou-dev";
  return scope + ":" + createHmac("sha256", secret).update(clientIp(req)).digest("hex").slice(0, 24);
}

// ---------- Validation ----------
export function str(v: unknown, name: string, o: { min?: number; max: number; optional?: boolean }): string {
  if (v === undefined || v === null || v === "") {
    if (o.optional) return "";
    throw new ApiError(400, "invalid_" + name, `Champ « ${name} » requis.`);
  }
  if (typeof v !== "string") throw new ApiError(400, "invalid_" + name);
  const s = v.replace(/\u0000/g, "").trim();
  if (s.length < (o.min ?? 1) && !(o.optional && s.length === 0)) throw new ApiError(400, "invalid_" + name, `Champ « ${name} » trop court.`);
  if (s.length > o.max) throw new ApiError(400, "invalid_" + name, `Champ « ${name} » trop long.`);
  return s;
}

export function email(v: unknown, name = "email"): string {
  const s = str(v, name, { min: 5, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new ApiError(400, "invalid_" + name, "Adresse e-mail invalide.");
  return s;
}

export function oneOf<T extends string>(v: unknown, name: string, allowed: readonly T[], dflt?: T): T {
  if ((v === undefined || v === null || v === "") && dflt) return dflt;
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new ApiError(400, "invalid_" + name);
  return v as T;
}

export function isoDate(v: unknown, name: string): string {
  const s = str(v, name, { min: 10, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) throw new ApiError(400, "invalid_" + name, "Date attendue au format AAAA-MM-JJ.");
  return s;
}

export function strArray(v: unknown, name: string, o: { maxItems: number; maxLen: number }): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > o.maxItems) throw new ApiError(400, "invalid_" + name);
  return v.map((x) => str(x, name, { max: o.maxLen }));
}

export function intArray(v: unknown, name: string, o: { maxItems: number; min: number; max: number }): number[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > o.maxItems) throw new ApiError(400, "invalid_" + name);
  const out = v.map((x) => Number(x));
  if (out.some((n) => !Number.isInteger(n) || n < o.min || n > o.max)) throw new ApiError(400, "invalid_" + name);
  return Array.from(new Set(out)).sort((a, b) => b - a);
}

export function uuid(v: unknown, name = "id"): string {
  if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new ApiError(400, "invalid_" + name);
  return v.toLowerCase();
}

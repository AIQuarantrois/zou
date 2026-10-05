import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { ApiError } from "./http";
import { one, q } from "./db";

const COOKIE = "zou_session";
const SESSION_DAYS = 30;

function b64u(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

function secret() {
  if (env.authSecret.length < 32) throw new ApiError(503, "auth_not_configured", "La connexion n'est pas encore activée.");
  return env.authSecret;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest();
}

export function signSession(userId: string, now = Date.now()) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pay = b64u(JSON.stringify({ sub: userId, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 }));
  return `${head}.${pay}.${b64u(sign(`${head}.${pay}`))}`;
}

export function verifySession(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = sign(`${parts[0]}.${parts[1]}`);
  let given: Buffer;
  try { given = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof p.sub !== "string" || typeof p.exp !== "number" || p.exp * 1000 < now) return null;
    return p.sub;
  } catch { return null; }
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export type User = { id: string; email: string; name: string | null; phone: string | null; locale: string };

export async function currentUser(req: Request): Promise<User | null> {
  const tok = readCookie(req, COOKIE);
  if (!tok) return null;
  const id = verifySession(tok);
  if (!id) return null;
  const u = await one(`SELECT id, email, name, phone, locale FROM users WHERE id = $1`, [id]);
  return (u as User) ?? null;
}

export async function requireUser(req: Request): Promise<User> {
  const u = await currentUser(req);
  if (!u) throw new ApiError(401, "auth_required", "Connectez-vous pour continuer.");
  return u;
}

// ---------- Codes à usage unique ----------
export function newCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(email: string, code: string) {
  return createHmac("sha256", secret()).update(`${email.toLowerCase()}:${code}`).digest("hex");
}

export async function storeCode(email: string, code: string) {
  await q(`UPDATE otp_codes SET consumed_at = now() WHERE lower(email) = lower($1) AND consumed_at IS NULL`, [email]);
  await q(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`, [email, hashCode(email, code)]);
}

/** Vérifie le code ; au plus 5 essais par code. */
export async function checkCode(email: string, code: string): Promise<boolean> {
  const row = await one(
    `SELECT id, code_hash, attempts FROM otp_codes
     WHERE lower(email) = lower($1) AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  if (!row) return false;
  if (Number(row.attempts) >= 5) return false;
  const a = Buffer.from(String(row.code_hash), "hex");
  const b = Buffer.from(hashCode(email, code), "hex");
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (ok) await q(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [row.id]);
  else await q(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
  return ok;
}

// ---------- Jetons d'administration / cron ----------
export function bearerMatches(req: Request, expected: string, minLen: number) {
  if (expected.length < minLen) return false;
  const h = req.headers.get("authorization") || "";
  const got = h.startsWith("Bearer ") ? h.slice(7) : "";
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAdmin(req: Request) {
  if (!bearerMatches(req, env.adminToken, 24)) throw new ApiError(401, "admin_required", "Accès réservé.");
}

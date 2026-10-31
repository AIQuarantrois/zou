import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { ApiError } from "./http";
import { one, q } from "./db";

const COOKIE = "zou_session";
export const SESSION_COOKIE = COOKIE;
const SESSION_DAYS = 30;
// Le backoffice exige une connexion récente : un cookie volé ou oublié sur un appareil partagé n'y donne pas accès
// pendant 30 jours. L'application publique garde la durée normale.
export const ADMIN_SESSION_HOURS = 12;

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

/** `version` : users.session_version au moment de la connexion ; l'incrémenter révoque tous les jetons déjà émis. */
export function signSession(userId: string, version = 0, now = Date.now()) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pay = b64u(JSON.stringify({ sub: userId, v: version, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_DAYS * 86400 }));
  return `${head}.${pay}.${b64u(sign(`${head}.${pay}`))}`;
}

export type Session = { sub: string; v: number; iat: number };

export function verifySession(token: string, now = Date.now()): string | null {
  return readSession(token, now)?.sub ?? null;
}

/** Jeton signé et non expiré → son contenu. Un jeton émis avant les versions de session vaut version 0. */
export function readSession(token: string, now = Date.now()): Session | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = sign(`${parts[0]}.${parts[1]}`);
  let given: Buffer;
  try { given = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof p.sub !== "string" || typeof p.exp !== "number" || p.exp * 1000 < now) return null;
    return { sub: p.sub, v: typeof p.v === "number" ? p.v : 0, iat: typeof p.iat === "number" ? p.iat : 0 };
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

export type User = { id: string; email: string; name: string | null; phone: string | null; locale: string; is_admin: boolean };

/** Cœur commun à la lecture d'un compte à partir d'un jeton de session — utilisé par les routes d'API (cookie
 *  lu depuis la requête) comme par les pages du backoffice (cookie lu depuis `next/headers`). */
export async function sessionFromToken(tok: string | null): Promise<{ user: User; iat: number } | null> {
  if (!tok) return null;
  const s = readSession(tok);
  if (!s) return null;
  const u = await one(`SELECT id, email, name, phone, locale, is_admin, session_version FROM users WHERE id = $1`, [s.sub]);
  if (!u || Number(u.session_version) !== s.v) return null; // « déconnecter tous les appareils » est passé depuis
  const { session_version: _, ...user } = u;
  return { user: user as User, iat: s.iat };
}

export async function userFromSessionToken(tok: string | null): Promise<User | null> {
  return (await sessionFromToken(tok))?.user ?? null;
}

/** Connexion assez récente pour le backoffice (voir ADMIN_SESSION_HOURS). */
export function adminSessionFresh(iat: number, now = Date.now()) {
  return now - iat * 1000 < ADMIN_SESSION_HOURS * 3600_000;
}

export async function currentUser(req: Request): Promise<User | null> {
  return userFromSessionToken(readCookie(req, COOKIE));
}

export async function requireUser(req: Request): Promise<User> {
  const u = await currentUser(req);
  if (!u) throw new ApiError(401, "auth_required", "Connectez-vous pour continuer.");
  return u;
}

/** Accès au backoffice : connecté et marqué administrateur (distinct du jeton bearer `requireAdmin`, réservé
 *  aux scripts et au cron). Utilisé par les routes d'API appelées depuis les pages du backoffice. */
export async function requireAdminSession(req: Request): Promise<User> {
  const s = await sessionFromToken(readCookie(req, COOKIE));
  if (!s) throw new ApiError(401, "auth_required", "Connectez-vous pour continuer.");
  if (!s.user.is_admin) throw new ApiError(403, "admin_required", "Accès réservé aux administrateurs.");
  if (!adminSessionFresh(s.iat)) throw new ApiError(401, "admin_session_expired", "Session d'administration expirée : reconnectez-vous.");
  return s.user;
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

/** Jeton bearer (scripts, cron) OU session administrateur (backoffice) : les deux donnent le même accès. */
export async function requireAdminAny(req: Request): Promise<void> {
  if (bearerMatches(req, env.adminToken, 24)) return;
  await requireAdminSession(req);
}

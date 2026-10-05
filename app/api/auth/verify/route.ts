import { api, json, body, email, str, sameOrigin, ipKey, ApiError } from "@/lib/http";
import { checkCode, sessionCookie, signSession } from "@/lib/auth";
import { one } from "@/lib/db";
import { limit } from "@/lib/ratelimit";

export const POST = api(async (req) => {
  sameOrigin(req);
  const b = await body(req, 2048);
  const addr = email(b.email);
  const code = str(b.code, "code", { min: 6, max: 6 });
  if (!/^\d{6}$/.test(code)) throw new ApiError(400, "invalid_code", "Code à 6 chiffres attendu.");
  await limit(ipKey(req, "verify-ip"), 30, 3600);

  if (!(await checkCode(addr, code))) throw new ApiError(401, "wrong_code", "Code incorrect ou expiré.");
  const user = await one(
    `INSERT INTO users (email, last_login_at) VALUES ($1, now())
     ON CONFLICT (lower(email)) DO UPDATE SET last_login_at = now()
     RETURNING id, email, name, phone, locale`,
    [addr]
  );
  if (!user) throw new ApiError(500, "user_error");
  return json({ user }, 200, { "Set-Cookie": sessionCookie(signSession(String(user.id))) });
});

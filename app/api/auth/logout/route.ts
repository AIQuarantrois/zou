import { api, json, sameOrigin } from "@/lib/http";
import { clearCookie } from "@/lib/auth";

export const POST = api(async (req) => {
  sameOrigin(req);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
});

import { NextResponse, type NextRequest } from "next/server";

// Le backoffice (/admin) est la seule partie de l'application à avoir besoin d'hydratation React
// (formulaires, boutons) : Next.js injecte alors des <script> en ligne pour l'hydratation, que la CSP
// stricte de next.config.mjs (script-src 'self', sans 'unsafe-inline') bloquerait sans cette dérogation
// ciblée par jeton (nonce) à usage unique par requête — jamais 'unsafe-inline'. Le reste de l'application
// (PWA publique, API) n'est pas concerné : il n'exécute aucun script en ligne et garde la CSP de
// next.config.mjs telle quelle (le middleware ne s'exécute pas hors de /admin, cf. `matcher`).
export function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = { matcher: "/admin/:path*" };

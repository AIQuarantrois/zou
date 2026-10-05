// Serveur local de test : sert l'interface (public/) et les vraies routes de app/api, sur le Postgres local
// des tests (double du pilote Neon), avec les en-têtes de sécurité de next.config.mjs (dont la CSP).
// Usage : node --import ./tests/register.mjs tests/server.mjs  (port 3999, ZOU_PORT pour changer)
// ZOU_FAKE_AI=1 remplace l'appel à Claude par une réponse fixe citant les deux premiers passages.
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
process.env.DATABASE_URL ||= "stub://local";
process.env.AUTH_SECRET ||= "s".repeat(48);
process.env.AUTH_DEV_ECHO ||= "1";
process.env.ADMIN_TOKEN ||= "a".repeat(32);
process.env.BLOB_READ_WRITE_TOKEN ||= "vercel_blob_rw_local"; // magasin Blob simulé en mémoire (tests/stubs/blob.mjs)
if (process.env.ZOU_FAKE_AI === "1") {
  process.env.ANTHROPIC_API_KEY ||= "test-key";
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.anthropic.com")) {
      return new Response(JSON.stringify({ content: [{ type: "text", text: "Réponse de test fondée sur le texte [1].\n\nCe que vous pouvez faire :\n- Lire l'article cité [1]\n- Comparer avec [2]" }] }), { status: 200 });
    }
    return real(url, init);
  };
}

// Routes : app/api/**/route.ts → motif d'URL (les segments [x] deviennent des paramètres).
const routes = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === "route.ts") {
      const segs = relative(join(ROOT, "app"), dir).split(sep);
      routes.push({ file: p, segs });
    }
  }
})(join(ROOT, "app", "api"));
routes.sort((a, b) => a.segs.filter((s) => s.startsWith("[")).length - b.segs.filter((s) => s.startsWith("[")).length);

function match(pathname) {
  const parts = pathname.replace(/^\/|\/$/g, "").split("/");
  for (const r of routes) {
    if (r.segs.length !== parts.length) continue;
    const params = {};
    if (r.segs.every((s, i) => (s.startsWith("[") ? ((params[s.slice(1, -1)] = decodeURIComponent(parts[i])), true) : s === parts[i]))) return { r, params };
  }
  return null;
}

const nextConfig = (await import(pathToFileURL(join(ROOT, "next.config.mjs")).href)).default;
const headerRules = await nextConfig.headers();
function headersFor(pathname) {
  const out = {};
  for (const rule of headerRules) {
    const re = new RegExp("^" + rule.source.replace(/\/:path\*|\/:file\*/g, "(?:/.*)?").replace(/\./g, "\\.") + "$");
    if (re.test(pathname)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const m = match(url.pathname);
      const mod = m && (await import(pathToFileURL(m.r.file).href));
      const handler = mod && mod[req.method];
      if (!handler) { res.writeHead(m ? 405 : 404, { "content-type": "application/json" }); res.end('{"error":"not_found"}'); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const request = new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const response = await handler(request, { params: Promise.resolve(m.params) });
      const h = Object.fromEntries(response.headers);
      res.writeHead(response.status, { ...headersFor(url.pathname), ...h });
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const rel = url.pathname === "/" ? "app.html" : decodeURIComponent(url.pathname.slice(1));
    const file = join(ROOT, "public", rel);
    if (!file.startsWith(join(ROOT, "public")) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end("introuvable"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", ...headersFor(url.pathname === "/" ? "/app.html" : url.pathname) });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end("erreur");
  }
});
const port = Number(process.env.ZOU_PORT || 3999);
server.listen(port, () => console.log(`ZOU local : http://localhost:${port}`));

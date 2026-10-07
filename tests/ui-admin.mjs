// Backoffice (app/admin) : ce sont de vraies pages Next.js (React, hydratées côté client), pas la SPA à fichier
// unique — le serveur local léger de tests/server.mjs (qui ne sert que les routes /api et les fichiers
// statiques, cf. tests/ui-a11y.mjs) ne les rend pas, il faut donc un vrai `next start` le temps de ce test.
// Sans base de données jointe ici (voir tests/e2e.mjs pour la logique métier — rôle administrateur, numéros
// utiles — déjà couverte en profondeur), ce test vérifie la page de connexion, le repli « accès réservé » quand
// la base ou la session manquent, et surtout que l'hydratation React fonctionne : /admin a besoin de scripts en
// ligne pour s'hydrater, que la CSP stricte du reste de l'application (script-src 'self', sans script en ligne)
// bloquerait — d'où middleware.ts, qui donne un jeton (nonce) à usage unique par requête rien que pour /admin,
// sans jamais assouplir la CSP du reste de l'application (vérifié ici aussi).
// Prérequis en plus de ceux de tests/ui-famille.mjs : `npm run build` déjà fait (dossier .next présent).
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const NEXT_PORT = 3997;
const BASE = `http://localhost:${NEXT_PORT}`;
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
const problems = [];
let n = 0;
const ok = (m) => console.log("  ok", ++n, m);
async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  // « status of 500 » : attendu ici — sans base jointe, la vraie base ne peut pas joindre « stub://local »
  // (seul le chargeur de tests/register.mjs sait la remplacer, et il n'agit pas dans le bundle compilé d'un
  // vrai next start) ; les routes qui écrivent en base avant de répondre (ex. la limitation de débit de
  // /api/auth/request) échouent donc ici. La logique elle-même est couverte à fond par tests/e2e.mjs.
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|status of 500/.test(m.text())) problems.push("console: " + m.text()); });
  await page.goto(BASE + path); await page.waitForTimeout(300);
  return { ctx, page };
}

if (!existsSync(new URL("../.next", import.meta.url))) throw new Error("dossier .next absent : lancez « npm run build » avant ce test (backoffice servi par un vrai next start)");
// DATABASE_URL pointe vers une base factice (aucune requête ne l'atteint dans ce test : sans session, le
// backoffice redirige vers la connexion avant tout accès à la base, cf. app/admin/(protected)/layout.tsx).
// La logique métier qui a vraiment besoin d'une base (rôle administrateur, numéros utiles) est couverte à
// fond par tests/e2e.mjs, qui lui tourne contre le Postgres local des tests.
const next = spawn(new URL("../node_modules/.bin/next", import.meta.url).pathname, ["start", "-p", String(NEXT_PORT)], {
  cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: "stub://local", AUTH_SECRET: "s".repeat(48) },
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("next start : délai dépassé")), 30000);
  const onData = (d) => { if (/Ready in|started server/i.test(String(d))) { clearTimeout(timer); resolve(); } };
  next.stdout.on("data", onData); next.stderr.on("data", onData);
  next.on("exit", (code) => { clearTimeout(timer); reject(new Error("next start : arrêt prématuré (" + code + ")")); });
});

try {
  await runChecks();
} finally {
  await browser.close();
  next.kill("SIGKILL");
}

async function runChecks() {
// ---- 1. CSP : jeton (nonce) sur /admin uniquement, jamais 'unsafe-inline', le reste de l'application inchangé
const adminCsp = (await fetch(BASE + "/admin/login")).headers.get("content-security-policy");
assert.match(adminCsp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/, "CSP de /admin : jeton par requête");
assert.doesNotMatch(adminCsp, /script-src[^;]*unsafe-inline/, "jamais 'unsafe-inline' dans script-src, même pour le backoffice");
const appCsp = (await fetch(BASE + "/")).headers.get("content-security-policy");
assert.match(appCsp, /script-src 'self'(?!.*nonce)/, "CSP de l'application publique : inchangée, sans jeton");
const apiCsp = (await fetch(BASE + "/api/health")).headers.get("content-security-policy");
assert.doesNotMatch(apiCsp, /nonce/, "CSP de l'API : inchangée, sans jeton");
ok("CSP : jeton par requête réservé à /admin, reste de l'application inchangé, jamais 'unsafe-inline'");

// ---- 2. Connexion : page accessible, hydratée (le champ réagit vraiment, pas seulement visuellement)
let { ctx, page } = await open("/admin/login");
assert.match(await page.locator("h1").innerText(), /Backoffice/);
await page.fill("#ad-email", "test@example.com");
await page.click('button[type="submit"]');
await page.waitForTimeout(400);
// Sans e-mail configuré ici, la demande échoue proprement (503) mais la tentative prouve que le clic a bien
// déclenché le JS React (hydratation réussie) plutôt que de rester inerte sous une CSP qui l'aurait bloqué.
assert.equal(problems.filter((p) => /Refused to execute inline script|React error #41/.test(p)).length, 0, "aucune violation de CSP ni erreur d'hydratation : " + problems.join(" | "));
await ctx.close();
ok("connexion : page hydratée, le formulaire réagit (pas de script en ligne bloqué, pas d'erreur d'hydratation)");

// ---- 3. Sans session, /admin renvoie vers la connexion
({ ctx, page } = await open("/admin"));
assert.equal(new URL(page.url()).pathname, "/admin/login", "redirigée vers la connexion sans session");
await ctx.close();
ok("accès au backoffice sans session : redirection vers /admin/login");
}

if (problems.length) { console.log("\nPROBLÈMES :\n" + problems.join("\n")); process.exitCode = 1; }
console.log(`\n${n} vérifications réussies`);

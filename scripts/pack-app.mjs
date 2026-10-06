// Transforme la page publiée en artefact (fragment HTML) en vrai document servi par Vercel :
// <head> complet, CSS et JS extraits en fichiers (CSP sans 'unsafe-inline' pour les scripts), manifeste PWA, service worker.
import { splashLinks } from "./splash-sizes.mjs";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";

const src = readFileSync(new URL("../src/artifact.html", import.meta.url), "utf8");

const style = src.match(/<style>([\s\S]*?)<\/style>/);
const script = src.match(/<script>([\s\S]*?)<\/script>/);
if (!style || !script) throw new Error("style ou script introuvable dans src/artifact.html");

// Corps = tout ce qui suit le dernier élément de tête (title/meta/link/style) et précède le script.
let body = src.slice(src.indexOf("</style>") + "</style>".length, src.indexOf("<script>"));
body = body.trim();

const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
const cssName = `app.${hash(style[1])}.css`;
const jsName = `app.${hash(script[1])}.js`;
const themeSrc = readFileSync(new URL("./theme-init.js", import.meta.url), "utf8");
const themeName = `theme.${hash(themeSrc)}.js`;
mkdirSync(new URL("../public/assets/", import.meta.url), { recursive: true });
for (const f of readdirSync(new URL("../public/assets/", import.meta.url))) if (/^(app|theme)\..*\.(css|js)$/.test(f)) rmSync(new URL(`../public/assets/${f}`, import.meta.url));
writeFileSync(new URL(`../public/assets/${cssName}`, import.meta.url), style[1].trim() + "\n");
writeFileSync(new URL(`../public/assets/${jsName}`, import.meta.url), script[1].trim() + "\n");
writeFileSync(new URL(`../public/assets/${themeName}`, import.meta.url), themeSrc.trim() + "\n");

const title = (src.match(/<title>([^<]*)<\/title>/) || [, "ZOU"])[1];
const desc = (src.match(/<meta name="description" content="([^"]*)"/) || [, ""])[1];

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161616" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<script src="/assets/${themeName}"></script>
<meta name="robots" content="noindex, nofollow">
<meta property="og:site_name" content="ZOU">
<meta property="og:title" content="ZOU. Des réponses maintenant.">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ZOU">
${splashLinks()}
<link rel="preload" href="/assets/fonts/inter-4-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/bricolage-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/${cssName}">
</head>
<body>
${body}
<script src="/assets/${jsName}"></script>
<script src="/register-sw.js"></script>
</body>
</html>
`;
writeFileSync(new URL("../public/app.html", import.meta.url), html);
console.log("app.html", html.length, "octets;", cssName, jsName);

// Service worker : la liste des fichiers à garder hors ligne et la version du cache sont calculées ici,
// pour que tout soit en cache dès l'installation (premier lancement compris) et que chaque version purge la précédente.
const pub = (f) => new URL(`../public/${f}`, import.meta.url);
const fonts = readdirSync(pub("assets/fonts/")).filter((f) => f.endsWith(".woff2")).sort().map((f) => `/assets/fonts/${f}`);
const precache = [
  "/app.html", "/offline.html", "/manifest.webmanifest", "/favicon.svg", "/register-sw.js",
  `/assets/${cssName}`, `/assets/${jsName}`, `/assets/${themeName}`, ...fonts,
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png",
];
const swSrc = readFileSync(new URL("./sw.src.js", import.meta.url), "utf8");
const swHash = createHash("sha256");
for (const f of precache) swHash.update(f + "\0").update(f === "/app.html" ? html : readFileSync(pub(f.slice(1))));
swHash.update(swSrc);
const sw = swSrc.replace("__VERSION__", `zou-${swHash.digest("hex").slice(0, 10)}`).replace("__PRECACHE__", JSON.stringify(precache, null, 2));
writeFileSync(pub("sw.js"), sw);
console.log("sw.js", precache.length, "fichiers en cache");

// Génère les écrans de démarrage iPhone (public/icons/splash/) à partir du logo de src/artifact.html.
// Outil ponctuel, à relancer si le logo ou les couleurs de fond changent : demande playwright-core
// (non installé par défaut) et un Chromium (variable ZOU_CHROME). Usage : node scripts/make-splash.mjs
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
import { SPLASH, splashFile } from "./splash-sizes.mjs";

const src = readFileSync(new URL("../src/artifact.html", import.meta.url), "utf8");
const sym = src.match(/<symbol id="zou-wordmark" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/);
const THEMES = { light: { bg: "#FFFFFF", ink: "#111827", smile: "#2563EB" }, dark: { bg: "#161616", ink: "#F3F3F3", smile: "#7EA6F2" } };
mkdirSync(new URL("../public/icons/splash/", import.meta.url), { recursive: true });
const browser = await chromium.launch(process.env.ZOU_CHROME ? { executablePath: process.env.ZOU_CHROME } : {});
for (const [w, h, r] of SPLASH) for (const [t, c] of Object.entries(THEMES)) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: r });
  await page.setContent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:${c.bg};--trust:${c.ink};--smile:${c.smile}">
    <svg viewBox="${sym[1]}" style="width:${Math.round(w * 0.36)}px">${sym[2]}</svg></body>`);
  await page.screenshot({ path: new URL("../public" + splashFile(w, h, r, t), import.meta.url).pathname });
  await page.close();
}
await browser.close();
console.log(SPLASH.length * 2, "écrans de démarrage");

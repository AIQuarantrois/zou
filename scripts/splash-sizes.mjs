// Écrans de démarrage iPhone (apple-touch-startup-image), en clair et en sombre.
// [largeur CSS, hauteur CSS, densité] en portrait ; fichiers produits par scripts/make-splash.mjs.
export const SPLASH = [
  [440, 956, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3],
  [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2],
];
export const splashFile = (w, h, r, theme) => `/icons/splash/${theme}-${w * r}x${h * r}.png`;
export function splashLinks() {
  return SPLASH.flatMap(([w, h, r]) => ["light", "dark"].map((t) =>
    `<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${t})" href="${splashFile(w, h, r, t)}">`
  )).join("\n");
}

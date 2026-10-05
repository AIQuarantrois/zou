/* ZOU : applique les réglages d'affichage (thème, taille du texte, contraste) avant le premier affichage, pour éviter un éclair clair.
   Chargé dans <head> ; la logique complète (page « Affichage et lisibilité ») est dans l'application. */
(function () {
  try {
    var p = JSON.parse(localStorage.getItem("zou_prefs_v1") || "null") || {};
    var r = document.documentElement;
    if (p.theme === "light" || p.theme === "dark") r.setAttribute("data-theme", p.theme);
    if (p.size === "large" || p.size === "xlarge") r.setAttribute("data-size", p.size);
    if (p.contrast) r.setAttribute("data-contrast", "high");
    var dark = p.theme === "dark" || (p.theme !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", dark ? "#161616" : "#FFFFFF");
  } catch (e) { /* réglages ignorés */ }
})();

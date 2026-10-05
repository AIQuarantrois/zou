// Convertit un PDF de texte de loi en fichier textes/<nom>.txt, prêt à être découpé et chargé.
// Usage : node scripts/pdf-to-texte.mjs "fichier.pdf" "Titre du texte" [nom-du-fichier]
// Nécessite pdftotext (paquet poppler-utils). Un PDF scanné (image) ne contient pas de texte : il faut le retranscrire.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [pdf, title, name] = process.argv.slice(2);
if (!pdf || !title) {
  console.error('Usage : node scripts/pdf-to-texte.mjs "fichier.pdf" "Titre du texte" [nom-du-fichier]');
  process.exit(1);
}
const r = spawnSync("pdftotext", ["-enc", "UTF-8", pdf, "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (r.error || r.status !== 0) {
  console.error("pdftotext a échoué :", r.error ? r.error.message : r.stderr.trim());
  process.exit(1);
}
const text = r.stdout
  .replace(/\f/g, "\n")
  .replace(/\r\n?/g, "\n")
  .replace(/[  ]/g, " ")
  .split("\n")
  .map((l) => l.replace(/\s+$/, ""))
  .filter((l) => !/^\s*[-–—]?\s*\d{1,4}\s*[-–—]?\s*$/.test(l)) // numéros de page seuls
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();
if (text.replace(/\s/g, "").length < 200) {
  console.error(`${pdf} : presque aucun texte extrait (${text.length} caractères). PDF scanné ? Il faut le retranscrire.`);
  process.exit(2);
}
const slug = (name || title)
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const out = new URL(`../textes/${slug}.txt`, import.meta.url);
writeFileSync(out, `# ${title}\n\n${text}\n`);
console.log(`textes/${slug}.txt : ${text.length} caractères`);

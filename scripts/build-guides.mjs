// Génère une page HTML statique par guide (public/guides/<id>.html), un index (public/guides.html),
// public/assets/guides.<hash>.css et le sitemap. Source : le tableau CONTENT de src/artifact.html, c'est-à-dire
// exactement les données de l'application : aucune phrase juridique n'est ajoutée ici.
// Appelé par pack-app.mjs ; peut aussi se lancer seul : node scripts/build-guides.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";

export const SITE = "https://zou-mg.app";

// CONTENT.domain -> libellé du domaine dans l'application (tableau DOMS de src/artifact.html)
const DOMAINES = {
  travail: { cat: "Travail", d: "Contrats, salaire, congés, licenciement, démission" },
  foncier: { cat: "Terrain", d: "Immatriculation, titre, vente, hypothèque, expropriation" },
  penal: { cat: "Procédure pénale", d: "Plainte, garde à vue, détention, recours" },
  civil: { cat: "Procédure civile", d: "Appel, délais de procédure, arbitrage" },
  prevoyance: { cat: "Protection sociale", d: "Accident du travail, maternité, pension, cotisations" },
  hygiene: { cat: "Santé et sécurité", d: "Lieu de travail, médecine du travail, contrôle" },
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const cut = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…"; };

const CSS = `
:root{--bg:#fff;--wash:#F3F4F6;--ink:#111827;--ink-2:#374151;--ink-3:#59616E;--rule:#E5E7EB;--accent:#0B63E8;--accent-hover:#0A4FC4;--accent-soft:#E4EEFF;--warn-bg:#FFF6E5;--warn-text:#93370D;--font-ui:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--font-disp:"Bricolage","Inter",system-ui,sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--wash:#1f2125;--ink:#F3F4F6;--ink-2:#D1D5DB;--ink-3:#A3ABB8;--rule:#33363c;--accent:#6AA5FF;--accent-hover:#9CC2FF;--accent-soft:#18283f;--warn-bg:#2b2112;--warn-text:#F5C77E}}
@font-face{font-family:"Inter";font-weight:100 900;font-display:swap;src:url(/assets/fonts/inter-4-latin.woff2) format("woff2")}
@font-face{font-family:"Bricolage";font-weight:200 800;font-display:swap;src:url(/assets/fonts/bricolage-latin.woff2) format("woff2")}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--font-ui)}
a{color:var(--accent)}a:hover{color:var(--accent-hover)}
header.top{border-bottom:1px solid var(--rule)}
header.top div{max-width:760px;margin:0 auto;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px}
header.top a.logo{font:800 22px var(--font-disp);color:var(--ink);text-decoration:none;letter-spacing:-.02em}
main{max-width:760px;margin:0 auto;padding:24px 20px 56px}
nav.fil{font-size:14px;color:var(--ink-3);margin-bottom:12px}nav.fil a{color:var(--ink-3)}
h1{font:700 clamp(26px,5vw,38px)/1.15 var(--font-disp);letter-spacing:-.015em;margin:.2em 0 .4em}
h2{font:700 22px/1.25 var(--font-disp);margin:1.8em 0 .5em}
p.lead{font-size:19px;color:var(--ink-2)}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;padding:0;list-style:none;font-size:14px}
.meta li{background:var(--wash);border-radius:4px;padding:3px 10px;color:var(--ink-2)}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:4px;margin:6px 0 4px}
.cta:hover{background:var(--accent-hover);color:#fff}
@media (prefers-color-scheme:dark){.cta{color:#0b1220}.cta:hover{color:#0b1220}}
ol.steps{padding-left:1.3em}ol.steps li{margin:0 0 14px}ol.steps b{display:block}
.cite{color:var(--ink-3);font-size:14px;white-space:nowrap}
.sub{color:var(--ink-3);font-size:14px}
main{overflow-wrap:anywhere}
ul.pts{padding-left:1.2em}ul.pts li{margin:0 0 12px}
.note{background:var(--warn-bg);color:var(--warn-text);border-radius:6px;padding:14px 16px;font-size:15px;margin:24px 0}
details{border-top:1px solid var(--rule);padding:10px 0}summary{cursor:pointer;font-weight:600}
blockquote{margin:8px 0;padding:6px 14px;border-left:3px solid var(--rule);color:var(--ink-2);font-size:15px}
ul.liste{list-style:none;padding:0;margin:0}ul.liste li{border-top:1px solid var(--rule);padding:10px 0}
ul.liste a{font-weight:600;text-decoration:none}ul.liste span{display:block;color:var(--ink-3);font-size:15px}
footer{border-top:1px solid var(--rule);margin-top:40px;padding-top:16px;font-size:14px;color:var(--ink-3)}
`;

export function buildGuides({ src, pub }) {
  const m = src.match(/var CONTENT = (\[[\s\S]*?\]);\n/);
  if (!m) throw new Error("CONTENT introuvable dans src/artifact.html");
  const content = JSON.parse(m[1]);

  const cssHash = createHash("sha256").update(CSS).digest("hex").slice(0, 10);
  const cssName = `guides.${cssHash}.css`;
  mkdirSync(new URL("assets/", pub), { recursive: true });
  for (const f of readdirSync(new URL("assets/", pub))) if (/^guides\..*\.css$/.test(f)) rmSync(new URL(`assets/${f}`, pub));
  writeFileSync(new URL(`assets/${cssName}`, pub), CSS.trim());

  mkdirSync(new URL("guides/", pub), { recursive: true });
  for (const f of readdirSync(new URL("guides/", pub))) rmSync(new URL(`guides/${f}`, pub));

  const head = ({ title, desc, path, ld }) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${SITE}${path}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161616" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="ZOU">
<meta property="og:type" content="article">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/inter-4-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/${cssName}">
${ld}
</head>
<body>
<header class="top"><div><a class="logo" href="/">ZOU</a><a href="/guides">Tous les guides</a></div></header>
<main>
`;
  const foot = `
<footer>
<p>ZOU explique le droit malgache à partir des textes de loi. C'est de l'information juridique, pas un conseil d'avocat : en cas d'enjeu important, faites vérifier votre situation par un professionnel du droit.</p>
<p>Édité par Quarantrois SARL, Antananarivo · <a href="mailto:contact@zou-mg.app">contact@zou-mg.app</a></p>
</footer>
</main>
</body>
</html>
`;

  const urls = [];
  const parDomaine = [];
  let n = 0;
  for (const dom of content) {
    const label = DOMAINES[dom.domain];
    if (!label) throw new Error(`Domaine inconnu : ${dom.domain}`);
    const liste = [];
    for (const g of dom.guides) {
      const path = `/guides/${g.id}`;
      const siblings = dom.guides.filter((x) => x.id !== g.id).slice(0, 6);
      const desc = cut(`${g.desc}. ${g.summary || ""}`.replace(/\.\s*\./g, "."), 158);
      const title = `${g.title} · ZOU`;
      const ld = jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article", headline: g.title, description: cut(g.summary || g.desc, 300), inLanguage: "fr",
            mainEntityOfPage: SITE + path, articleSection: label.cat, audience: g.audience ? { "@type": "Audience", audienceType: g.audience } : undefined,
            author: { "@type": "Organization", name: "ZOU", url: SITE + "/" }, publisher: { "@type": "Organization", name: "ZOU", url: SITE + "/", logo: { "@type": "ImageObject", url: SITE + "/og.png" } },
            image: SITE + "/og.png",
          },
          {
            "@type": "BreadcrumbList", itemListElement: [
              { "@type": "ListItem", position: 1, name: "ZOU", item: SITE + "/" },
              { "@type": "ListItem", position: 2, name: "Guides", item: SITE + "/guides" },
              { "@type": "ListItem", position: 3, name: g.title, item: SITE + path },
            ],
          },
        ],
      });
      const steps = (g.steps || []).map((s) => `<li><b>${esc(s.t)}</b>${esc(s.d)}${s.cite ? ` <span class="cite">(${esc(s.cite)})</span>` : ""}</li>`).join("\n");
      const points = (g.points || []).map((s) => `<li><b>${esc(s.t)}.</b> ${esc(s.d)}${s.cite ? ` <span class="cite">(${esc(s.cite)})</span>` : ""}</li>`).join("\n");
      const deadlines = (g.deadlines || []).map((s) => `<li><b>${esc(s.t)} :</b> ${esc(s.amount)} ${esc(s.unit)}${s.from ? `, à compter de ${esc(s.from)}` : ""}${s.cite ? ` <span class="cite">(${esc(s.cite)})</span>` : ""}</li>`).join("\n");
      const docs = (g.docs || []).map((s) => `<li>${esc(typeof s === "string" ? s : s.t || s.title || "")}</li>`).filter((x) => x !== "<li></li>").join("\n");
      const verify = (g.verify || []).map((v) => `<li>${esc(v)}</li>`).join("\n");
      const sources = (g.sources || []).map((s) => `<blockquote>« ${esc(s.quote)} »<br><span class="sub">${esc(s.ref)}${s.doc ? ` · ${esc(s.doc)}` : ""}</span></blockquote>`).join("\n");
      const html = head({ title, desc, path, ld }) + `
<nav class="fil" aria-label="Fil d'Ariane"><a href="/">ZOU</a> › <a href="/guides">Guides</a> › <a href="/guides#${esc(dom.domain)}">${esc(label.cat)}</a></nav>
<h1>${esc(g.title)}</h1>
<ul class="meta">${g.time ? `<li>${esc(g.time)} de lecture</li>` : ""}<li>${esc(label.cat)}</li></ul>
${g.summary ? `<p class="lead">${esc(g.summary)}</p>` : ""}
${g.audience ? `<p><b>Pour qui :</b> ${esc(g.audience)}</p>` : ""}
<p><a class="cta" href="/#guide.${esc(g.id)}">Ouvrir ce guide dans l'application ZOU</a><br><span class="sub">Dans l'application : rappels, ajout à l'agenda, documents et calculs.</span></p>
${steps ? `<h2>Les étapes</h2>\n<ol class="steps">\n${steps}\n</ol>` : ""}
${deadlines ? `<h2>Délais à retenir</h2>\n<ul class="pts">\n${deadlines}\n</ul>` : ""}
${docs ? `<h2>Documents utiles</h2>\n<ul class="pts">\n${docs}\n</ul>` : ""}
${points ? `<h2>Points d'attention</h2>\n<ul class="pts">\n${points}\n</ul>` : ""}
${verify ? `<div class="note"><b>À vérifier avant d'agir</b><ul>\n${verify}\n</ul></div>` : ""}
${sources ? `<details><summary>Extraits des textes de loi</summary>\n${sources}\n</details>` : ""}
${siblings.length ? `<h2>Autres guides : ${esc(label.cat)}</h2>\n<ul class="liste">${siblings.map((x) => `<li><a href="/guides/${esc(x.id)}">${esc(x.title)}</a><span>${esc(x.desc)}</span></li>`).join("")}</ul>` : ""}
` + foot;
      writeFileSync(new URL(`guides/${g.id}.html`, pub), html);
      urls.push(SITE + path);
      liste.push(g);
      n++;
    }
    parDomaine.push({ dom: dom.domain, label, liste });
  }

  // Index : un bloc par domaine
  const idxDesc = `${n} guides pratiques sur le droit malgache (travail, terrain, procédure, protection sociale), expliqués étape par étape à partir des textes de loi.`;
  const idxLd = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: "Guides ZOU : le droit malgache pas à pas", url: SITE + "/guides", inLanguage: "fr", description: idxDesc },
      { "@type": "ItemList", itemListElement: parDomaine.flatMap((p) => p.liste).map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/guides/${g.id}`, name: g.title })) },
    ],
  });
  const idx = head({ title: "Guides ZOU : le droit malgache pas à pas", desc: idxDesc, path: "/guides", ld: idxLd }).replace('og:type" content="article"', 'og:type" content="website"') + `
<h1>Les guides ZOU</h1>
<p class="lead">${esc(idxDesc)}</p>
<p><a class="cta" href="/">Ouvrir l'application ZOU</a></p>
${parDomaine.map((p) => `<h2 id="${esc(p.dom)}">${esc(p.label.cat)}</h2>\n<p class="sub">${esc(p.label.d)}</p>\n<ul class="liste">${p.liste.map((g) => `<li><a href="/guides/${esc(g.id)}">${esc(g.title)}</a><span>${esc(g.desc)}</span></li>`).join("")}</ul>`).join("\n")}
` + foot;
  writeFileSync(new URL("guides.html", pub), idx);

  const all = [SITE + "/", SITE + "/guides", ...urls];
  writeFileSync(new URL("sitemap.xml", pub), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all.map((u) => `<url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);

  const llms = readFileSync(new URL("llms.txt", pub), "utf8");
  const bloc = `## Guides (${n} pages, une par démarche)\n- [Tous les guides](${SITE}/guides)\n${parDomaine.map((p) => `- ${p.label.cat} : ${p.liste.length} guides, par exemple [${p.liste[0].title}](${SITE}/guides/${p.liste[0].id})`).join("\n")}\n`;
  const llmsOut = llms.replace(/## Guides \([\s\S]*?(?=\n## |$)/, "").replace(/\n## Pages/, `\n${bloc}\n## Pages`).replace(/\n{3,}/g, "\n\n");
  writeFileSync(new URL("llms.txt", pub), llmsOut);
  return { n, cssName };
}

// Lancement direct
if (import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1]?.endsWith("build-guides.mjs")) {
  const src = readFileSync(new URL("../src/artifact.html", import.meta.url), "utf8");
  const r = buildGuides({ src, pub: new URL("../public/", import.meta.url) });
  console.log("guides", r.n, r.cssName);
}

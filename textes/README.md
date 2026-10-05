# Textes de loi

Chaque fichier de ce dossier est un texte de loi que l'assistant peut citer. Ils sont chargés en base
**automatiquement à chaque déploiement en production** (`scripts/setup-db.mjs`, lancé par `vercel-build`).
Un texte inchangé n'est pas réécrit ; un texte modifié est remplacé d'un seul bloc (transaction).

## Formats acceptés

**Texte brut (`.txt` ou `.md`)** — découpé automatiquement :

- la première ligne est le titre (`# Code du travail` ou `Code du travail`) ;
- le nom du fichier donne l'identifiant de la source (`Code du travail.txt` → `code-du-travail`) ;
- chaque ligne qui commence par `Article 12`, `Art. 12 bis`, `ARTICLE PREMIER`, `Article 12-1 .-`… ouvre un article ;
- les lignes `LIVRE I`, `TITRE II`, `CHAPITRE premier`, `SECTION 3`… (et la ligne qui suit, si elle est courte)
  deviennent l'intitulé des articles suivants ;
- un article de plus de 8 000 caractères est coupé entre deux paragraphes (`Art. 12 (suite 1)`…).

```
# Code du travail

TITRE I
DU CONTRAT DE TRAVAIL

Article premier.- Le présent code s'applique…

Article 2
Est considéré comme travailleur…
```

**JSON (`.json`)** — déjà découpé, même format que `POST /api/admin/ingest` :

```json
{ "source": "code-travail", "title": "Code du travail",
  "chunks": [{ "article": "Art. 1", "heading": "TITRE I", "text": "…" }] }
```

## Ajouter un PDF

`node scripts/pdf-to-texte.mjs "fichier.pdf" "Titre du texte" [nom-du-fichier]` écrit `textes/<nom>.txt` (titre en première ligne,
numéros de page retirés). Nécessite `pdftotext` (paquet poppler-utils). Un PDF scanné ne contient pas de texte : il faut le retranscrire
(c'est le cas de `decret-2026-411-prescription-acquisitive.txt`, transcrit à la main : **à relire contre l'original**).

Les recueils (plusieurs lois dont la numérotation recommence, comme `droits-civils.txt` ou `lois-foncieres.txt`) sont reconnus :
chaque article est rattaché à sa loi (« Loi n° 2008-013… · TITRE I — … »).

## Vérifier avant de déployer

`npm run db:ingest -- --check` affiche, pour chaque fichier, le nombre d'articles repérés, sans toucher à la base.
Un fichier mal formé fait échouer le déploiement plutôt que de charger un texte incomplet.

Les sources présentes en base mais absentes de ce dossier (chargées par l'API, ou fichiers supprimés) sont conservées ;
le script les signale.

## Textes chargés (octobre 2026)

18 textes, environ 8 350 passages : Code du travail (2024), décret 2007-009 (préavis), Code d'hygiène et de sécurité, Code de prévoyance
sociale, Code de procédure pénale, loi 2016-039 (procédure civile), loi 2016-038 (nationalité), état civil (2018), mariage et régimes
matrimoniaux (2007), droits et protection des enfants (2007), recueil « Droits civils », recueil foncier (2015), décret 2026-411
(prescription acquisitive), baux commerciaux (2015), statut du commerçant (1999), sociétés commerciales (2003), procédures collectives
(2003), et le Guide de l'OIT sur les normes internationales du travail (2014 ; texte protégé par le droit d'auteur, l'assistant n'en cite
que de courts extraits avec leur source).

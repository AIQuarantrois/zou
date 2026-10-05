# ZOU — socle technique

Assistant d'information juridique sur le droit malgache. Next.js (App Router) sur Vercel, base Neon (Postgres), assistant Claude.

## Architecture

- `public/app.html` : l'interface ZOU (PWA), servie à `/` (réécriture dans `next.config.mjs`). Généré par `npm run pack:app` à partir de `src/artifact.html` : toute modification se fait dans `src/artifact.html`, puis `npm run pack:app`.
- Interface ↔ API (section « Serveur » de `src/artifact.html`) : au démarrage, `GET /api/health` dit ce qui est branché. Sans serveur ou sans base, l'interface reste en mode invité, comme avant. Avec l'IA, les questions vont à `/api/ask` (réponse, renvois [n], sources) ; sinon, comportement d'origine.
- `app/api/*` : routes d'API (Node). Aucune dépendance autre que `next`, `react`, `react-dom`, `@neondatabase/serverless`, `@vercel/blob` (Node ≥ 22.6).
- `lib/schema.ts` : schéma Postgres, appliqué par `POST /api/admin/migrate` ou `npm run db:migrate`.
- `lib/ingest.ts` : chargement des textes de loi (validation, découpage automatique en articles, remplacement atomique).
- `textes/` : les textes de loi, chargés automatiquement à chaque déploiement en production (voir `textes/README.md`).
- `lib/ask.ts` : recherche plein texte (français, accents pliés) dans `legal_chunks` — classement par nombre de mots de la question présents, puis pertinence corrigée de la longueur — puis appel à Claude avec citations obligatoires. Recherche par mots-clés seulement : une question formulée sans les mots du texte (« quel âge pour se marier ») trouve mal ; une recherche sémantique (embeddings) serait l'étape suivante.
- Parcours de vie (`src/artifact.html`, section « Parcours de vie ») : une question par écran, puis un plan personnalisé (verdict, dates limites calculées avec ajout à l'agenda, étapes à cocher, pièces à préparer, lieux, lettre pré-remplie, sources). Un parcours est décrit par des données (`defVie` : questions avec conditions, fonction `plan`). Domaine « Famille » : naissance, jugement supplétif, mariage, séparation et divorce, décès et héritage, enfant en danger, nationalité. Domaine « Entreprise et commerce » (lois 2015-037, 99-018, 2003-036 et 2003-042) : bail commercial (renouvellement, congé, loyer, cession, résiliation), lancer son activité ou créer une société, comptes annuels et assemblée, entreprise en difficulté (cessation des paiements, règlement préventif), créance dans une faillite. Les montants fixés par décret (capital minimum…) et la procédure d'immatriculation ne figurent pas dans les textes chargés : les parcours le disent au lieu de les inventer. Proposés depuis l'accueil (« Qu'est-ce qui vous arrive ? »), les Services et l'assistant (mots-clés). Réponses et progression sauvegardées dans les dossiers du compte (`kind: vie`).
- Mode invité : l'interface fonctionne sans compte ; les données restent dans le navigateur. `POST /api/import` les rattache à un compte à la première connexion (idempotent).
- Synchronisation : une fois connecté, chaque enregistrement local part au serveur (création, modification, suppression), et l'état du compte est récupéré au démarrage, au retour de la connexion et au retour sur l'onglet. Démarche « Démissionner » et guides → `cases` ; agenda → `events` ; coffre → `documents` (métadonnées). Les exemples ne sont jamais envoyés. Effacer les données de l'appareil déconnecte d'abord, sans rien supprimer du compte.
- Fichiers du coffre : Vercel Blob en **accès privé** (`lib/blob.ts`). Envoi par `PUT /api/documents/:id/file` (corps brut, 4 Mo au plus, PDF / JPEG / PNG / WebP / HEIC / Word, 200 Mo par compte), téléchargement par `GET` (propriétaire seulement, toujours en pièce jointe), retrait par `DELETE`. Supprimer un document supprime son fichier. Aucune URL de fichier n'est jamais transmise au navigateur.
- Connexion : code à 6 chiffres envoyé par e-mail (Resend), session par cookie signé HttpOnly de 30 jours.
- Rappels : tâche planifiée quotidienne (`vercel.json`, 05:00 UTC = 08:00 à Antananarivo) → `/api/cron/reminders`.

## Variables d'environnement (`.env.example`)

| Variable | Rôle | Sans elle |
|---|---|---|
| `DATABASE_URL` | Neon (chaîne pooled) | API de données en 503, interface en mode invité |
| `AUTH_SECRET` (≥ 32 car.) | signature des sessions | connexion désactivée |
| `ANTHROPIC_API_KEY` | assistant | `/api/ask` en 503 |
| `RESEND_API_KEY`, `MAIL_FROM` | e-mails (codes, rappels, contacts) | codes non envoyés, rappels non partis |
| `ADMIN_TOKEN` (≥ 24 car.) | migrations, ingestion, vérification des pros | routes admin refusées |
| `CRON_SECRET` (≥ 16 car.) | protège la tâche de rappels | tâche refusée |
| `BLOB_STORE_ID` ou `BLOB_READ_WRITE_TOKEN` | fichiers du coffre : ajoutée par Vercel en reliant un magasin Blob (les magasins récents n'ajoutent que `BLOB_STORE_ID`, l'accès passant par le jeton OIDC que Vercel fournit à chaque requête) | seules les informations des documents sont sauvegardées |
| `SUPPORT_EMAIL` | destinataire du formulaire de contact | message enregistré, non transmis |
| `ZOU_DB_SETUP` | `auto` (défaut), `always` ou `off` : préparation de la base au déploiement | `auto` : production seulement |

## Mise en route

1. Créer le projet Vercel lié au dépôt, ajouter la base Neon (Marketplace Vercel → Neon : `DATABASE_URL` est renseignée automatiquement), créer un magasin Blob **en accès privé** (Storage → Blob) et le relier au projet (`BLOB_STORE_ID` ou `BLOB_READ_WRITE_TOKEN` est renseigné automatiquement), puis ajouter les autres variables ci-dessus.
2. Le schéma est appliqué automatiquement au déploiement (étape 3). Pour l'appliquer à la main, au choix :
   - depuis un poste : `npm install` puis `DATABASE_URL=… npm run db:migrate` (lit aussi `.env.local` / `.env`) ;
   - sur le site déployé : `curl -X POST https://<domaine>/api/admin/migrate -H "Authorization: Bearer $ADMIN_TOKEN"`.

   Les deux passent par `applyMigrations` (`lib/schema.ts`) et sont idempotents. `npm run db:sql` affiche le SQL sans l'exécuter.
3. Déposer les textes de loi dans `textes/` (`.txt`/`.md` découpés automatiquement, ou `.json` déjà découpé ; voir `textes/README.md`)
   et déployer. Le script `vercel-build` lance `scripts/setup-db.mjs` avant `next build` : migrations, puis chargement
   des textes nouveaux ou modifiés (un texte inchangé n'est pas réécrit, un texte modifié est remplacé en une transaction).
   Ignoré sans `DATABASE_URL` et sur les prévisualisations (`ZOU_DB_SETUP=always` pour les inclure, `off` pour tout désactiver) ;
   une erreur fait échouer le déploiement. À la main : `npm run db:ingest` (`-- --check` pour vérifier le découpage sans base,
   `-- --force` pour tout recharger). Toujours possible par l'API : `POST /api/admin/ingest` avec `{ source, title, chunks: [{ article, heading, text }] }`.
4. Vérifier : `GET /api/health`.

## Routes

Publiques : `GET /api/health`, `POST /api/ask`, `GET /api/pros`, `POST /api/pros/:id/contact`, `POST /api/contact`, `POST /api/auth/request|verify|logout`.
Connecté : `/api/me`, `/api/cases`, `/api/events`, `/api/documents`, `/api/import`, `/api/pros` (inscription), `/api/pros/me`.
Admin (jeton) : `/api/admin/migrate`, `/api/admin/ingest`, `/api/admin/pros`.

## Tests

`npm test` (tests unitaires puis `tests/e2e.mjs`, 59 vérifications, jouées deux fois : Blob par clé read-write, puis par identifiant de magasin (OIDC) ; sur des bases vides).

`npm run serve:local` lance l'interface et les vraies routes sur http://localhost:3999, sur ce même Postgres local, avec les en-têtes de sécurité (CSP comprise). Le code de connexion est prérempli (`AUTH_DEV_ECHO`) ; `ZOU_FAKE_AI=1` simule la réponse de Claude. Contre ce serveur (base vide, `ZOU_FAKE_AI=1`), `tests/ui.mjs` déroule 14 parcours dans Chromium (invité, assistant, connexion, synchronisation entre deux appareils, annuaire, espace pro, contact, déconnexion) ; `tests/ui-famille.mjs` en déroule 17 autres (les 7 parcours Famille, dates calculées, agenda, dossiers, assistant, reprise sur un second appareil, écran de téléphone et large) ; `tests/ui-commerce.mjs` en déroule 18 (les 5 parcours Entreprise et commerce, dates limites calculées, lettres, assistant, services, textes). Le Postgres de test doit être en UTF8 (sinon la recherche plein texte déforme les accents). Ils demandent `playwright-core`, non installé par défaut. Ils tournent sur un Postgres local via un double du pilote Neon (`tests/stubs/neon.mjs`) .

## Limites connues

- Fichiers : 4 Mo au plus (limite des fonctions Vercel ; au-delà, prévoir l'envoi direct du navigateur vers Blob). Un fichier ajouté n'est gardé qu'en mémoire jusqu'à son envoi : sans compte, ou si la page est rechargée avant l'envoi, seules ses informations restent, et le coffre propose « Joindre le fichier ».
- Rappels : seul l'e-mail est envoyé (les canaux WhatsApp/SMS ont été retirés de l'interface). Le partage de documents avec un professionnel n'existe pas encore : la demande de contact transmet un message.
- Synchronisation sans fusion fine : une modification locale non envoyée l'emporte sur le serveur ; sinon le serveur l'emporte. La démarche « Démissionner » d'un nouvel appareil remplace celle du compte si elle a déjà été commencée sur cet appareil avant la connexion.
- CSP : `style-src 'unsafe-inline'` reste nécessaire (attributs `style` de l'interface).
- La balise `noindex` de `app.html` est volontaire jusqu'au lancement.

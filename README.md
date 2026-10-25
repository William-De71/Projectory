<div align="center">

# 🗂️ Projectory

**Suivi de tous tes projets de dev au même endroit : GitHub / GitLab / Gitea, CI, versions, bugs du forum, roadmap, specs, notes et temps passé.**

[![CI](https://github.com/William-De71/projectory/actions/workflows/ci.yml/badge.svg)](https://github.com/William-De71/projectory/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/William-De71/projectory?sort=semver)](https://github.com/William-De71/projectory/releases)

Auto-hébergé (Docker), mono-utilisateur, données dans un seul fichier SQLite.

**Français** · [English](README.en.md)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png">
  <img src="docs/screenshots/dashboard.png" alt="Tableau de bord de Projectory : chiffres clés, CI en échec, projets épinglés, nouveautés et tâches prioritaires">
</picture>

---

## Fonctionnalités

| | |
|---|---|
| **Projets classés par catégories** | Freelance, Perso, Organisation (Gladys…), Autre — catégories modifiables avec couleur. Statut (idée, actif, maintenance, pause, archivé), client, tags, liens, épinglage. |
| **GitHub, GitLab, Gitea / Forgejo** | Chaque projet pointe vers un dépôt sur github.com, gitlab.com ou une instance auto-hébergée (GitLab, Gitea, Forgejo). Un token par instance dans **Paramètres → Forges et tokens**. |
| **Import de dépôts en masse** | Liste les dépôts d'un utilisateur, d'une organisation ou d'un groupe (filtre, forks, archivés) et crée les projets d'un coup avec catégorie, statut et suivi des releases. Les dépôts déjà suivis sont ignorés. |
| **Suivi des dépôts** | Issues et PR / MR ouvertes, étoiles, dernière activité. Filtres « Me concernant » (ouvert par toi, assigné, review demandée, mentionné — d'après le compte du token), par label, auteur ou titre, mémorisés par projet : pratique sur un dépôt très actif comme Gladys. Réglage par projet « Issues et PR suivies » : en mode Auto (par défaut), tout est suivi sur tes dépôts, et seulement ce qui te concerne sur ceux des autres (compteurs, tableau de bord, « En attente », notifications). Les **nouvelles** arrivent dans la boîte de réception ; un bouton « Suivre » les ajoute aux bugs & tâches. |
| **Mon GitHub** | Un onglet de « À traiter » qui réunit, sur tous tes projets, les reviews qu'on te demande, tes PR, ce qui t'est assigné, tes mentions et tes issues. Chaque PR affiche son état : approuvée, changements demandés, conflit avec la branche principale, CI. Un clic en fait une tâche au titre explicite (« Résoudre le conflit : #3028… »). Sur tes PR, une approbation, une demande de changements, un conflit ou une CI rouge arrive dans la boîte de réception et sur ntfy. |
| **Créer une issue depuis un bug** | Un bug remonté par le forum devient une issue sur le dépôt (titre, description, lien du forum, version cible, label). Lien dans les deux sens : quand l'issue est fermée, le bug passe à « Terminé ». |
| **État de la CI** | GitHub Actions (dernier run de chaque workflow), pipelines GitLab, statuts de commit Gitea/Forgejo (Actions, Woodpecker, Drone) sur la branche principale : pastille verte/rouge (seuls les runs déclenchés par le code comptent : les tâches planifiées et les workflows lancés à la main sont ignorés), alerte au tableau de bord, notification quand la CI casse puis repasse au vert. |
| **Notifications GitHub perso** | Reviews demandées, mentions, assignations, réponses sur tes issues/PR (ex. vers GladysAssistant/Gladys), rattachées au projet suivi correspondant. Nécessite un token classique avec le scope `notifications`. |
| **Versions & changelog** | Onglet **Versions** par projet : jalons (1.2.0, 1.3.0…) avec date prévue, progression, éléments planifiés et non planifiés. **Publier** une version génère son changelog Markdown (nouveautés / corrections / autres) à copier, télécharger ou garder en note, et peut créer directement la **release sur GitHub, GitLab ou Gitea / Forgejo** (tag, brouillon, pré-version) avec ce changelog en description ; changelog complet du projet en un clic. **Checklist de release** à cocher sur chaque version (modèle réglable dans les paramètres, rappel si elle est incomplète au moment de publier) et **annonce pour le forum** prête à poster : nouveau sujet Discourse prérempli, ou réponse dans un sujet suivi. |
| **Notifications push ntfy** | Nouveautés envoyées sur ton téléphone via [ntfy](https://ntfy.sh) (serveur public ou auto-hébergé, token supporté), choix des événements, regroupement au-delà de 3 nouveautés, projets rendus muets individuellement. |
| **Veille des versions** | Dernière release/tag du dépôt (toute forge), d'un autre dépôt GitHub, d'un paquet npm ou d'une image Docker Hub, comparée à la version que *tu* utilises/déploies → badge « mise à jour disponible » et notification. |
| **Bugs remontés par un forum** | Forums **Discourse** (ex. [forum Gladys](https://community.gladysassistant.com) : catégorie, tag ou recherche) et **flux RSS/Atom** (filtre par mots-clés). Un clic transforme un sujet en bug suivi. Source « Discourse : mes mentions » : uniquement les messages qui te taguent (`@pseudo`), avec notification ntfy dédiée. Quand un bug venu du forum est corrigé, ou quand sa version est publiée, un message prêt à poster est proposé : il salue l'auteur du message (`@pseudo`) et donne la version, le lien de la release et celui de l'issue / PR ; copié, et le sujet s'ouvre. **Sujets suivis** : chaque nouvelle réponse d'un sujet (bouton 👁 dans l'activité, ou lien collé dans l'onglet Activité) arrive dans la boîte de réception et sur ntfy. |
| **Ma journée** | En haut de l'accueil : choisis 3 à 5 bugs ou tâches pour la journée (☀ dans les listes, ou depuis la vue) et coche-les au fil de l'eau ; ce qui n'est pas fini est reporté au lendemain. À côté : échéances dépassées ou du jour, reviews GitHub demandées, suggestions (en cours, prioritaires), CI en échec, temps passé. |
| **Captures et pièces jointes** | Colle (<kbd>Ctrl</kbd>+<kbd>V</kbd>) ou glisse une capture d'écran ou un fichier dans la description d'un bug, une note ou une spec : il est enregistré dans `data/uploads/` et inséré en Markdown (image affichée, autres fichiers en lien). Les images apparaissent en miniatures sous le champ (clic pour agrandir) et « Prévisualiser » affiche le rendu. 25 Mo maximum par fichier. |
| **Bugs & tâches manuels** | Bug / fonctionnalité / tâche / question, priorité, statut (à faire, en cours, en test, bloqué, terminé, abandonné), échéance, version cible, lien externe, **PR / MR liée** (quand elle est fusionnée, l'élément passe tout seul « En test »). **Sous-tâches** avec avancement (☑ 2/5), **liens** entre éléments (bloqué par — l'élément repasse « À faire » quand ce qui le bloquait est terminé —, doublon de, lié à), **modèles de description** par projet et par type. Vue liste ou tableau Kanban (glisser-déposer). Dans la liste : **actions groupées** (statut, priorité, version, suppression), **vues enregistrées** (filtres nommés) et **raccourcis clavier** (<kbd>j</kbd>/<kbd>k</kbd>, <kbd>e</kbd>, <kbd>s</kbd>, <kbd>x</kbd>, <kbd>n</kbd>, <kbd>/</kbd>). |
| **Dépendances** | Les PR de Dependabot et Renovate de tous tes projets dans un onglet de « À traiter », avec l'état de leur CI. Fusion à l'unité, ou de toutes celles au vert en un clic (CI et conflits revérifiés sur la forge juste avant chaque fusion). Le token doit avoir le droit de fusionner. |
| **Spécifications** | Documents Markdown par projet avec modèle prérempli (contexte, objectifs, critères d'acceptation…) et statut brouillon / à relire / validée. |
| **Notes** | Notes Markdown par projet ou globales, bouton « + Nouveau » partout dans l'app. |
| **Temps passé** | Dans Paramètres → Temps passé : saisie rapide par projet, total du mois et par projet (pratique pour facturer le freelance). |
| **À traiter** | Tout ce qui attend une action, en quatre onglets : nouveautés depuis la dernière synchro (lu/non lu, filtres par source et projet), Mon GitHub, Dépendances et En attente. Un seul compteur dans le menu. |
| **Accueil** | Alertes (CI en échec, synchros en erreur), ta journée, puis la vue d'ensemble : chiffres clés (chacun ouvre la liste correspondante), projets épinglés, mises à jour dispo, PR récentes. |
| **Issues et PR qui dorment** | Issues sans réponse depuis N jours, PR / MR sans activité depuis N jours (seuils réglables) : signalées au tableau de bord et dans l'onglet du dépôt. |
| **Résumé hebdomadaire** | Une notification ntfy par semaine (jour et heure au choix) : CI en échec, PR en attente, issues sans réponse, prioritaires, échéances des 14 jours, mises à jour, temps passé. Aperçu et envoi immédiat dans les paramètres. |
| **Statistiques** | Onglet **Statistiques** par projet sur 3, 6 ou 12 mois : commits, issues et PR / MR ouvertes et fermées par semaine, délai médian de résolution, bugs & tâches, temps passé — graphiques ou tableau. |
| **Calendrier (ICS)** | Lien d'abonnement pour Google Agenda, Apple Calendrier, Thunderbird… : échéances des bugs & tâches, versions prévues et publiées. Lien secret régénérable. |
| **Palette de commandes** | <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>⌘</kbd>+<kbd>K</kbd> sur Mac) : aller à une page ou un projet, chercher, créer un bug, une note, une spec, synchroniser, changer de thème ou de langue. |
| **Application installable (PWA)** | « Installer » depuis Chrome / Edge, ou « Sur l'écran d'accueil » sur iPhone : icône, plein écran, raccourcis. **Hors ligne**, les pages déjà ouvertes restent consultables (dernières données chargées) et les nouveaux bugs, tâches et notes sont mis en attente puis envoyés au retour du réseau. |
| **Sauvegardes automatiques** | Copie quotidienne de la base (sans arrêter l'app), rotation 7 jours + 4 semaines, téléchargeables depuis les paramètres. |
| **Recherche globale** | Projets, bugs, specs, notes (noms des pièces jointes compris), issues et PR des dépôts ; page de résultats avec un extrait autour du mot cherché. |
| **Export** | JSON complet en un clic, ou copie du fichier `data/projectory.db`. |

Thème clair/sombre, interface **en français ou en anglais** (bouton FR / EN en haut à droite ; le changelog, les notifications et les messages suivent la langue choisie), utilisable sur mobile.

### Aperçu

| | |
|---|---|
| ![Liste des projets par catégorie, avec issues, PR, état de la CI et versions](docs/screenshots/projects.png) | ![Fiche projet : description, liens, dépôt, CI et versions à mettre à jour](docs/screenshots/project.png) |
| **Projets** — catégories, compteurs, CI, mises à jour disponibles | **Fiche projet** — dépôt, CI, versions utilisée / publiée |
| ![Bugs et tâches de tous les projets en tableau Kanban](docs/screenshots/board.png) | ![Boîte de réception : sujets du forum, CI en échec, review demandée, nouvelles versions](docs/screenshots/inbox.png) |
| **Bugs & tâches** — liste ou Kanban, tous projets confondus | **Boîte de réception** — forum, dépôts, CI, versions, notifications perso |
| ![Onglet Versions : jalons avec progression et éléments planifiés](docs/screenshots/versions.png) | ![Changelog Markdown généré pour une version](docs/screenshots/changelog.png) |
| **Versions** — jalons, progression, éléments sans version | **Changelog** — généré à la publication, à copier ou télécharger |

<sub>Captures réalisées avec des données de démonstration.</sub>

> 💡 À la **première** synchro d'une source, l'existant est enregistré comme déjà lu : seules les nouveautés suivantes apparaissent en non lu.

---

## Démarrage avec Docker (recommandé)

Les images sont publiées sur GitHub Container Registry pour `amd64` et `arm64` (Raspberry Pi, NAS…) :

| Tag | Contenu |
|---|---|
| `latest` | dernière release |
| `1.2.3`, `1.2`, `1` | une release précise / la dernière d'une branche de versions |
| `dev`, `dev-<sha>` | dernier commit de `main` (images de développement) |

```bash
mkdir projectory && cd projectory
curl -O https://raw.githubusercontent.com/William-De71/projectory/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/William-De71/projectory/main/.env.example   # puis édite-le
docker compose up -d
```

Ouvre http://localhost:3001. Les données sont dans `./data/projectory.db`.

- Mise à jour : `docker compose pull && docker compose up -d`, ou le bouton **Mettre à jour maintenant** (voir ci-dessous)
- Tester la version de dev : `PROJECTORY_TAG=dev` dans `.env`
- Construire depuis les sources : `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`

> Le premier push d'une image sur GHCR crée un paquet **privé**. Rends-le public (GitHub → ton profil → Packages → projectory → Package settings → Change visibility) ou fais `docker login ghcr.io` avant le `pull`.

### Mise à jour depuis l'interface

Projectory vérifie les releases GitHub : quand une nouvelle version sort, une notification apparaît et un lien « vX.Y.Z disponible » s'affiche en bas du menu, avec les notes de version. Pour avoir aussi le bouton **Mettre à jour maintenant**, active [Watchtower](https://github.com/nicholas-fedor/watchtower) dans `.env` :

```bash
COMPOSE_PROFILES=updater
WATCHTOWER_TOKEN=$(openssl rand -hex 32)   # colle la valeur générée
```

puis `docker compose up -d`. Watchtower n'agit que sur demande (pas de vérification périodique) et uniquement sur le conteneur Projectory ; c'est lui, et non Projectory, qui a accès au socket Docker. Le bouton n'apparaît pas si `PROJECTORY_TAG` est une version fixe (`1.2.3`).

### Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `GITHUB_TOKEN` | — | Token GitHub (les comptes saisis dans **Paramètres → Forges et tokens** sont prioritaires). Sans token : 60 requêtes/heure et dépôts publics seulement. *Fine-grained* : Metadata, Contents, Pull requests, Actions en lecture + Issues en écriture. Pour les notifications perso : token **classique** avec les scopes `repo` et `notifications`. |
| `GITLAB_TOKEN` | — | Token GitLab par défaut (scope `api`, ou `read_api` sans création d'issues). |
| `GITEA_URL`, `GITEA_TOKEN` | — | Instance Gitea / Forgejo par défaut et son token (droits repository + issue). |
| `PROJECTORY_TAG` | `latest` | Tag de l'image Docker utilisée par `docker-compose.yml`. |
| `COMPOSE_PROFILES`, `WATCHTOWER_TOKEN` | — | `updater` et un jeton secret pour le bouton de mise à jour (voir ci-dessus). |
| `SYNC_INTERVAL_MINUTES` | `30` | Synchro automatique (0 = uniquement via le bouton 🔄). |
| `APP_PASSWORD` | — | Active une authentification HTTP basique (identifiant libre). À mettre si l'app est exposée hors de ton réseau. |
| `PROJECTORY_PORT` | `3001` | Port exposé sur l'hôte. |
| `NTFY_SERVER`, `NTFY_TOPIC`, `NTFY_TOKEN` | `https://ntfy.sh`, —, — | Valeurs par défaut des notifications ; se règlent plutôt dans **Paramètres → Notifications push**. |
| `APP_URL` | — | Adresse de Projectory (ex. `http://192.168.1.10:3001`), utilisée par les liens des notifications. |
| `APP_LANG` | `fr` | Langue par défaut côté serveur (`fr` ou `en`) tant qu'aucune n'a été choisie dans l'interface. |
| `UPLOADS_DIR` | `/data/uploads` | Dossier des captures et pièces jointes. |
| `BACKUP_DIR` | `/data/backups` | Dossier des sauvegardes automatiques (ex. un partage NAS monté dans le conteneur). |
| `LOG_LEVEL` | `info` | Niveau de logs. |

### Sauvegarde

Projectory fait une copie quotidienne de la base dans `data/backups/` (les pièces jointes sont copiées dans `data/backups/uploads/`) (heure et rétention dans **Paramètres → Sauvegardes automatiques**, bouton « Sauvegarder maintenant »). Pour restaurer : arrête le conteneur, remplace `data/projectory.db` par la sauvegarde choisie (et recopie `backups/uploads/` dans `uploads/` si besoin), redémarre. Les pièces jointes qui ne sont plus utilisées nulle part sont supprimées après 24 h. L'export JSON reste disponible dans **Paramètres → Données et export**.

### Calendrier et téléphone

- **Calendrier** : copie le lien de **Paramètres → Calendrier (ICS)** dans ton agenda (« S'abonner à un calendrier » / « À partir de l'URL »). Ouvre Projectory avec son adresse réseau (pas `localhost`) pour obtenir un lien utilisable ailleurs. Le lien fonctionne même avec `APP_PASSWORD` : il contient sa propre clé secrète.
- **Installer l'app** : l'installation PWA demande HTTPS (ou `localhost`) ; derrière un reverse proxy avec certificat, utilise « Installer Projectory » dans le navigateur.

---

## Démarrage rapide avec tes dépôts

1. **Projets → Importer des dépôts** : choisis la forge, laisse le champ vide pour lister les dépôts du propriétaire du token (ou saisis `William-De71`), filtre sur `gladys-`, coche, choisis la catégorie, puis **Importer**.
2. La première synchro démarre en arrière-plan. Elle enregistre l'existant comme déjà lu, donc pas d'avalanche de notifications.
3. **Paramètres → Notifications push** : installe l'app ntfy sur ton téléphone, abonne-toi à un topic difficile à deviner, renseigne-le ici, puis **Envoyer un test**.

## Exemple : suivre Gladys

Dans **Projets → Nouveau projet** :

- **Catégorie** : Organisation — **Client** : Gladys
- **Dépôt** : GitHub, `GladysAssistant/Gladys`
- **Version utilisée** : celle installée chez toi, ex. `4.45.0`
- **Versions** : « Releases du dépôt » + « Image Docker Hub » → `gladysassistant/gladys`
- **Forum** : `Forum Discourse`, URL `https://community.gladysassistant.com`, puis au choix :
  - chemin vide → derniers sujets
  - chemin `c/<slug>/<id>` → une catégorie (l'URL de la catégorie sur le forum, sans le domaine)
  - chemin `tag/zigbee` → un tag
  - recherche `zigbee2mqtt order:latest` → résultats d'une recherche

Pour un forum non-Discourse, utilise son flux RSS/Atom (Discourse expose aussi `…/latest.rss`) avec des mots-clés en filtre : `bug, erreur, crash`.

---

## Développement

Prérequis : Node.js ≥ 22.13 (SQLite intégré à Node, aucune dépendance native).

```bash
# API (port 3001), données dans ./data
cd server && npm install && npm run dev

# Front (port 5173, proxy /api vers 3001)
cd web && npm install && npm run dev

# Tests de l'API (forges, forums et ntfy simulés)
cd server && npm test
```

### CI, images de dev et releases (GitHub Actions)

| Workflow | Déclencheur | Ce qu'il fait |
|---|---|---|
| **CI** (`ci.yml`) | push sur `main`, pull request, lancement manuel | Tests de l'API, build du front, puis image Docker. Sur `main` : publie `ghcr.io/william-de71/projectory:dev` et `:dev-<sha>` (amd64 + arm64). En PR : build seul, rien n'est publié. En manuel depuis une branche : publie `:dev-<branche>`. |
| **Release** (`release.yml`) | **Actions → Release → Run workflow**, choix `patch` / `minor` / `major` | Tests, calcul de la version suivante depuis le dernier tag `vX.Y.Z`, mise à jour des `package.json` et de `CHANGELOG.md` (commits classés en nouveautés / corrections / autres), commit + tag sur `main`, release GitHub avec les notes, images `:X.Y.Z`, `:X.Y`, `:X` et `:latest`. |

Pour un changelog propre, préfixe tes commits : `feat: …` (nouveauté), `fix: …` (correction) ; le reste va dans « Autres changements ».
La release pousse sur `main` avec le `GITHUB_TOKEN` du workflow : si tu protèges `main`, autorise GitHub Actions à contourner la règle.

### Architecture

```
projectory/
├── server/                 Fastify 5, ESM, node:sqlite
│   ├── src/
│   │   ├── index.js        démarrage + planificateur de synchro
│   │   ├── app.js          routes, auth optionnelle, service du front buildé
│   │   ├── db.js           schéma SQLite + migrations (PRAGMA user_version)
│   │   ├── routes/         projects, content (items/docs/catégories/temps), overview (inbox/dashboard/recherche/export)
│   │   │                   integrations (import, issues, comptes, notifications), milestones (versions, changelog)
│   │   └── sync/           forges/ (github, gitlab, gitea), sources.js (versions npm/Docker, Discourse, RSS), notify.js (ntfy), index.js (orchestration)
│   └── test/
├── web/                    React 19 + Vite + Ant Design 6
│   └── src/{pages,components,api}
├── data/                   volume : projectory.db
├── .github/                workflows CI / Release, scripts/release.mjs
├── Dockerfile              une seule image : build du front + API qui le sert
├── docker-compose.yml      image GHCR
└── docker-compose.build.yml  surcharge pour construire depuis les sources
```

Inspiré dans l'esprit de [portfolio-manager](https://github.com/AymericLeFeyer/portfolio-manager) (Fastify + React/Ant Design, CRUD en tiroirs, docker-compose), mais écrit de zéro.

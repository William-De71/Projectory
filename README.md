<div align="center">

# 🗂️ Projectory

**Suivi de tous tes projets de dev au même endroit : GitHub, versions, bugs du forum, specs, notes et temps passé.**

Auto-hébergé (Docker), mono-utilisateur, données dans un seul fichier SQLite.

</div>

---

## Fonctionnalités

| | |
|---|---|
| **Projets classés par catégories** | Freelance, Perso, Organisation (Gladys…), Autre — catégories modifiables avec couleur. Statut (idée, actif, maintenance, pause, archivé), client, tags, liens, épinglage. |
| **Import GitHub en masse** | Liste les dépôts d'un utilisateur ou d'une organisation (filtre, forks, archivés) et crée les projets d'un coup avec catégorie, statut et suivi des releases. Les dépôts déjà suivis sont ignorés. |
| **Suivi GitHub** | Issues et PR ouvertes de chaque dépôt, étoiles, dernier push. Les **nouvelles** issues/PR arrivent dans la boîte de réception. |
| **État de la CI** | Dernier run de chaque workflow GitHub Actions sur la branche principale : pastille verte/rouge sur les cartes, alerte au tableau de bord, notification quand la CI casse puis quand elle repasse au vert. |
| **Notifications push ntfy** | Nouveautés envoyées sur ton téléphone via [ntfy](https://ntfy.sh) (serveur public ou auto-hébergé, token supporté), choix des événements, regroupement au-delà de 3 nouveautés, projets rendus muets individuellement. |
| **Veille des versions** | Dernière release/tag GitHub, paquet npm ou image Docker Hub, comparée à la version que *tu* utilises/déploies → badge « mise à jour disponible » et notification. |
| **Bugs remontés par un forum** | Forums **Discourse** (ex. [forum Gladys](https://community.gladysassistant.com) : catégorie, tag ou recherche) et **flux RSS/Atom** (filtre par mots-clés). Un clic transforme un sujet en bug suivi. |
| **Bugs & tâches manuels** | Bug / fonctionnalité / tâche / question, priorité, statut, échéance, version cible, lien externe. Vue liste ou tableau Kanban (glisser-déposer). |
| **Spécifications** | Documents Markdown par projet avec modèle prérempli (contexte, objectifs, critères d'acceptation…) et statut brouillon / à relire / validée. |
| **Notes** | Notes Markdown par projet ou globales, bouton « Note rapide » partout dans l'app. |
| **Temps passé** | Saisie rapide par projet, total du mois et par projet (pratique pour facturer le freelance). |
| **Boîte de réception** | Tout ce qui est nouveau depuis la dernière synchro, lu/non lu, filtres par source et projet. |
| **Tableau de bord** | Chiffres clés, nouveautés, prioritaire / échéances proches, mises à jour dispo, PR récentes, erreurs de synchro. |
| **Recherche globale** | Projets, bugs, specs, notes, issues GitHub. |
| **Export** | JSON complet en un clic, ou copie du fichier `data/projectory.db`. |

Thème clair/sombre, interface en français, utilisable sur mobile.

> 💡 À la **première** synchro d'une source, l'existant est enregistré comme déjà lu : seules les nouveautés suivantes apparaissent en non lu.

---

## Démarrage avec Docker (recommandé)

```bash
git clone https://github.com/William-De71/projectory.git && cd projectory
cp .env.example .env        # puis renseigne GITHUB_TOKEN (conseillé)
docker compose up -d --build
```

Ouvre http://localhost:3001. Les données sont dans `./data/projectory.db`.

Mise à jour : `git pull && docker compose up -d --build`.

### Configuration (`.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `GITHUB_TOKEN` | — | Token GitHub. Sans token : 60 requêtes/heure et dépôts publics seulement (insuffisant au-delà de quelques projets). Un *fine-grained token* en lecture seule suffit : Metadata, Contents, Issues, Pull requests, Actions. |
| `SYNC_INTERVAL_MINUTES` | `30` | Synchro automatique (0 = uniquement via le bouton 🔄). |
| `APP_PASSWORD` | — | Active une authentification HTTP basique (identifiant libre). À mettre si l'app est exposée hors de ton réseau. |
| `PROJECTORY_PORT` | `3001` | Port exposé sur l'hôte. |
| `NTFY_SERVER`, `NTFY_TOPIC`, `NTFY_TOKEN` | `https://ntfy.sh`, —, — | Valeurs par défaut des notifications ; se règlent plutôt dans **Paramètres → Notifications push**. |
| `APP_URL` | — | Adresse de Projectory (ex. `http://192.168.1.10:3001`), utilisée par les liens des notifications. |
| `LOG_LEVEL` | `info` | Niveau de logs. |

### Sauvegarde

Copie `data/projectory.db` (idéalement app arrêtée, ou via `sqlite3 data/projectory.db ".backup backup.db"`), ou utilise **Paramètres → Exporter en JSON**.

---

## Démarrage rapide avec tes dépôts

1. **Projets → Importer depuis GitHub** : laisse le champ vide pour lister les dépôts du propriétaire du token (ou saisis `William-De71`), filtre sur `gladys-`, coche, choisis la catégorie, puis **Importer**.
2. La première synchro démarre en arrière-plan. Elle enregistre l'existant comme déjà lu, donc pas d'avalanche de notifications.
3. **Paramètres → Notifications push** : installe l'app ntfy sur ton téléphone, abonne-toi à un topic difficile à deviner, renseigne-le ici, puis **Envoyer un test**.

## Exemple : suivre Gladys

Dans **Projets → Nouveau projet** :

- **Catégorie** : Organisation — **Client** : Gladys
- **Dépôt GitHub** : `GladysAssistant/Gladys`
- **Version utilisée** : celle installée chez toi, ex. `4.45.0`
- **Versions** : `GitHub release/tag` (vide = dépôt du projet) + `Image Docker Hub` → `gladysassistant/gladys`
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

# Tests de l'API (GitHub / forums simulés)
cd server && npm test
```

### Architecture

```
projectory/
├── server/                 Fastify 5, ESM, node:sqlite
│   ├── src/
│   │   ├── index.js        démarrage + planificateur de synchro
│   │   ├── app.js          routes, auth optionnelle, service du front buildé
│   │   ├── db.js           schéma SQLite + migrations (PRAGMA user_version)
│   │   ├── routes/         projects, content (items/docs/catégories/temps), overview (inbox/dashboard/recherche/export)
│   │   └── sync/           github.js, sources.js (versions npm/Docker, Discourse, RSS), index.js (orchestration)
│   └── test/
├── web/                    React 19 + Vite + Ant Design 6
│   └── src/{pages,components,api}
├── data/                   volume : projectory.db
├── Dockerfile              une seule image : build du front + API qui le sert
└── docker-compose.yml
```

Inspiré dans l'esprit de [portfolio-manager](https://github.com/AymericLeFeyer/portfolio-manager) (Fastify + React/Ant Design, CRUD en tiroirs, docker-compose), mais écrit de zéro.

---

## Idées pour la suite

- Notifications GitHub personnelles (review demandée, mention) via `/notifications`
- GitLab / Gitea / Forgejo en plus de GitHub
- Création d'une issue GitHub depuis un bug suivi (et lien bidirectionnel)
- Facturation : taux horaire par projet freelance, export CSV du temps passé
- Jalons / roadmap par version, changelog généré depuis les bugs terminés
- Import des notes depuis le bloc-notes (copier-coller → découpage en notes)

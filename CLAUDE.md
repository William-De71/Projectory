# Projectory — notes pour Claude

- Mono-repo : `server/` (Fastify 5, ESM, `node:sqlite`, aucune dépendance native) et `web/` (React 19, Vite, Ant Design 6). Une seule image Docker : le serveur sert `web/dist`.
- UI bilingue FR / EN : le texte français est la source et sert de clé. Front : `t('Texte {var}', { var })` (`web/src/i18n/`, dictionnaire `en.js`) ; serveur : `tr()` (`server/src/i18n.js`, dictionnaire `i18n-en.js`) pour les erreurs, le changelog, ntfy et les entrées de la boîte de réception. Libellés dans des constantes : traduire au rendu, jamais au chargement du module. Toute nouvelle chaîne doit être ajoutée au dictionnaire anglais : `node web/scripts/i18n-keys.mjs --check` et le test serveur `i18n.test.js` le vérifient.
- Commentaires de code en anglais.
- Schéma : ajouter une migration en fin de tableau `MIGRATIONS` dans `server/src/db.js`, ne jamais modifier une migration existante.
- Colonnes JSON (tags, links, version_sources, forum_sources, github, versions, labels) : stockées en texte, décodées par `decode()` ; `pickUpdate()` les sérialise.
- node:sqlite refuse `undefined` et les booléens : passer `null` / `0|1`.
- Synchro (`server/src/sync/`) : toute nouveauté passe par `pushInbox` avec une `external_key` unique ; la première synchro d'une source est « baselinée » (marquée lue) via la table `settings`.
- `pushInbox` remplit aussi `fresh` (entrées nouvelles et non lues) : c'est ce qui part sur ntfy en fin de `syncProject` (`sync/notify.js`). La CI ne génère une entrée qu'aux changements d'état (vert → rouge, rouge → vert).
- Forges (`server/src/sync/forges/`) : un adaptateur par forge (github, gitlab, gitea — Forgejo = gitea) avec la même interface (`fetchRepo`, `fetchCi`, `latestRelease`, `createIssue`, `listOwnerRepos`). Toujours passer par `forgeFor(db, project)` qui résout le token (comptes `config:forges` puis variables d'env). Noms historiques : la table `github_items` et la colonne `projects.github` contiennent les données de toutes les forges.
- Source de version `repo` = releases du dépôt du projet (toute forge) ; `github` = autre dépôt GitHub.
- Tâches planifiées (`server/src/jobs.js`, tick 60 s) : résumé hebdo ntfy (`insights.js`) et sauvegardes `VACUUM INTO` (`backup.js`, `BACKUP_DIR`). Le flux `/api/calendar.ics?token=` échappe à `APP_PASSWORD` (clé dans `config:calendar`). Statistiques : `fetchActivity` des forges, agrégées par `stats.js`.
- Réglages applicatifs : `getConfig` / `setConfig` (clés `config:*` de la table `settings`). Le token ntfy n'est jamais renvoyé au front (`token_set`).
- Les tests suppriment `GITHUB_TOKEN` & co de l'environnement : garder ce bloc en tête de chaque fichier de test.
- Après une mutation côté front, appeler `notifyChange()` pour rafraîchir les composants qui écoutent (`useApi(url, { listen: true })`).
- Tests : `cd server && npm test` (fetch simulé, base en mémoire) et `node --test .github/scripts/*.test.mjs`. Build front : `cd web && npm run build`. Workflows : `actionlint`.
- Commits : préfixes `feat:` / `fix:` — le workflow Release s'en sert pour classer le changelog. Ne pas modifier la version des `package.json` à la main : c'est le workflow Release qui le fait.

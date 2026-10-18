# Projectory — notes pour Claude

- Mono-repo : `server/` (Fastify 5, ESM, `node:sqlite`, aucune dépendance native) et `web/` (React 19, Vite, Ant Design 6). Une seule image Docker : le serveur sert `web/dist`.
- UI et messages d'erreur en français ; commentaires de code en anglais.
- Schéma : ajouter une migration en fin de tableau `MIGRATIONS` dans `server/src/db.js`, ne jamais modifier une migration existante.
- Colonnes JSON (tags, links, version_sources, forum_sources, github, versions, labels) : stockées en texte, décodées par `decode()` ; `pickUpdate()` les sérialise.
- node:sqlite refuse `undefined` et les booléens : passer `null` / `0|1`.
- Synchro (`server/src/sync/`) : toute nouveauté passe par `pushInbox` avec une `external_key` unique ; la première synchro d'une source est « baselinée » (marquée lue) via la table `settings`.
- Après une mutation côté front, appeler `notifyChange()` pour rafraîchir les composants qui écoutent (`useApi(url, { listen: true })`).
- Tests : `cd server && npm test` (fetch simulé, base en mémoire). Build front : `cd web && npm run build`.

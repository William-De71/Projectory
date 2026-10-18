# Projectory — notes pour Claude

- Mono-repo : `server/` (Fastify 5, ESM, `node:sqlite`, aucune dépendance native) et `web/` (React 19, Vite, Ant Design 6). Une seule image Docker : le serveur sert `web/dist`.
- UI et messages d'erreur en français ; commentaires de code en anglais.
- Schéma : ajouter une migration en fin de tableau `MIGRATIONS` dans `server/src/db.js`, ne jamais modifier une migration existante.
- Colonnes JSON (tags, links, version_sources, forum_sources, github, versions, labels) : stockées en texte, décodées par `decode()` ; `pickUpdate()` les sérialise.
- node:sqlite refuse `undefined` et les booléens : passer `null` / `0|1`.
- Synchro (`server/src/sync/`) : toute nouveauté passe par `pushInbox` avec une `external_key` unique ; la première synchro d'une source est « baselinée » (marquée lue) via la table `settings`.
- `pushInbox` remplit aussi `fresh` (entrées nouvelles et non lues) : c'est ce qui part sur ntfy en fin de `syncProject` (`sync/notify.js`). La CI ne génère une entrée qu'aux changements d'état (vert → rouge, rouge → vert).
- Réglages applicatifs : `getConfig` / `setConfig` (clés `config:*` de la table `settings`). Le token ntfy n'est jamais renvoyé au front (`token_set`).
- Les tests suppriment `GITHUB_TOKEN` & co de l'environnement : garder ce bloc en tête de chaque fichier de test.
- Après une mutation côté front, appeler `notifyChange()` pour rafraîchir les composants qui écoutent (`useApi(url, { listen: true })`).
- Tests : `cd server && npm test` (fetch simulé, base en mémoire). Build front : `cd web && npm run build`.

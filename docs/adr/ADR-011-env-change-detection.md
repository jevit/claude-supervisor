# ADR-011: Detection des Changements d'Environnement

## Statut
Accepte - 2026-03-12

## Contexte
Quand une session installe un nouveau package, modifie un fichier de config, ou change des variables d'environnement, les autres sessions doivent etre informees pour eviter des comportements incoherents.

## Decision
Service `EnvWatcher` qui surveille les fichiers critiques du projet (package.json, .env, etc.) et alerte les sessions quand un changement est detecte.

## Implementation

### Service `EnvWatcher`
- Surveille une liste configurable de fichiers via `fs.watch`
- Fichiers surveilles par defaut: `package.json`, `package-lock.json`, `.env`, `tsconfig.json`
- Detecte les modifications et broadcasts `env:changed`
- Debounce de 2s pour eviter les notifications multiples
- Configurable: chemins a surveiller, intervalle de debounce

### API REST
- `GET /api/env/watches` — fichiers surveilles
- `POST /api/env/watches` — ajouter un fichier a surveiller
- `DELETE /api/env/watches` — arreter la surveillance d'un fichier
- `GET /api/env/changes` — historique des changements recents

## Fichiers
- `backend/src/services/env-watcher.js` — **nouveau**
- `backend/src/routes/env.js` — **nouveau**
- `backend/src/index.js` — integration

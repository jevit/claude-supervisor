# ADR-001: Persistance JSON

## Statut
Accepte - 2026-03-12

## Contexte
Toutes les donnees (agents, taches, sessions) sont en memoire et perdues au redemarrage du serveur. Pour un superviseur qui tourne en continu, il faut persister l'etat entre les restarts.

## Alternatives considerees

### 1. SQLite
- (+) Requetes SQL, transactions ACID
- (-) Dependance supplementaire, complexite inutile pour ce volume de donnees

### 2. Fichier JSON unique
- (+) Zero dependance, lisible humainement, debug facile
- (+) Suffisant pour le volume attendu (dizaines d'agents, centaines de taches)
- (-) Pas de requetes complexes, pas de concurrence multi-process

### 3. LevelDB / better-sqlite3
- (+) Performant, embedded
- (-) Surdimensionne pour le cas d'usage actuel

## Decision
**Fichier JSON unique** avec ecriture debounced.

## Implementation

### Service `JsonStore`
Fichier: `backend/src/services/json-store.js`

```
JsonStore(filePath, { debounceMs })
  .load()        → charge le fichier, retourne les donnees
  .get(key)      → lit une section
  .set(key, val) → met a jour + planifie sauvegarde debounced
  .saveSync()    → sauvegarde immediate (pour shutdown)
  .destroy()     → flush final + cleanup timer
```

**Mecanisme de sauvegarde:**
- Debounce de 1s : les ecritures rapprochees sont regroupees
- Ecriture atomique via fichier `.tmp` + `rename` (evite les fichiers corrompus)
- `saveSync()` appele au SIGINT/SIGTERM pour le graceful shutdown

### Integration
- `AgentSupervisor(broadcast, store)` — persiste agents et taches
- `TerminalTracker(broadcast, store)` — persiste sessions
- Methode `_persist()` appelee apres chaque mutation

### Structure du fichier
```json
// data/supervisor-data.json
{
  "agents": [...],
  "tasks": [...],
  "sessions": [...]
}
```

### Graceful shutdown
```js
process.on('SIGINT', () => { store.destroy(); process.exit(0); });
process.on('SIGTERM', () => { store.destroy(); process.exit(0); });
```

## Fichiers modifies
- `backend/src/services/json-store.js` — **nouveau fichier**
- `backend/src/services/supervisor.js` — accepte `store`, appelle `_persist()`
- `backend/src/services/terminal-tracker.js` — accepte `store`, appelle `_persist()`
- `backend/src/index.js` — cree JsonStore, passe aux services, graceful shutdown

## Verification
```bash
# 1. Demarrer, creer un agent
curl -X POST http://localhost:3001/api/agents -H "Content-Type: application/json" \
  -d '{"name":"Test","role":"dev"}'

# 2. Verifier le fichier
cat data/supervisor-data.json

# 3. Redemarrer le serveur, verifier que l'agent est restaure
curl http://localhost:3001/api/agents
```

# ADR-010: Contexte Partage

## Statut
Accepte - 2026-03-12

## Contexte
Chaque session Claude Code travaille en isolation sans connaitre le contexte des autres sessions. Un contexte partage permet de centraliser les informations utiles a toutes les sessions (decisions prises, conventions, decouvertes).

## Decision
Service `SharedContext` qui stocke des entries de contexte partage, accessibles par toutes les sessions.

## Implementation

### Service `SharedContext`
- `add(entry)` — ajoute une entry `{ key, value, author }`
- `get(key)` — recupere une entry par cle
- `getAll()` — toutes les entries
- `remove(key)` — supprime une entry
- `getSummary()` — resume compact du contexte (pour injection dans les prompts)
- Persiste dans le JsonStore (cle `sharedContext`)

### API REST
- `GET /api/context` — toutes les entries
- `GET /api/context/summary` — resume compact
- `POST /api/context` — ajouter une entry
- `DELETE /api/context/:key` — supprimer une entry

## Fichiers
- `backend/src/services/shared-context.js` — **nouveau**
- `backend/src/routes/context.js` — **nouveau**
- `backend/src/index.js` — integration

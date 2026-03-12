# ADR-009: Detection de Conflits

## Statut
Accepte - 2026-03-12

## Contexte
Au-dela du simple lock de fichier, il faut detecter quand deux sessions travaillent dans le meme repertoire ou sur des taches similaires, et alerter proactivement.

## Decision
Service `ConflictDetector` qui analyse periodiquement les sessions actives et les locks pour detecter les conflits potentiels.

## Implementation

### Service `ConflictDetector`
- Analyse les sessions actives pour detecter:
  - **Conflits de fichier**: meme fichier locke par 2+ sessions (via FileLockManager)
  - **Conflits de repertoire**: 2+ sessions dans le meme repertoire de travail
  - **Chevauchement de tache**: 2+ sessions avec des taches similaires (heuristique simple)
- Chaque conflit: `{ id, type, sessions, details, severity, timestamp }`
- Severites: `warning` (repertoire), `error` (fichier)
- Broadcast `conflict:detected` et `conflict:resolved`

### API REST
- `GET /api/conflicts` — liste les conflits actifs

## Fichiers
- `backend/src/services/conflict-detector.js` — **nouveau**
- `backend/src/routes/conflicts.js` — **nouveau**
- `backend/src/index.js` — integration

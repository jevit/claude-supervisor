# ADR-006: Systeme de Locks de Fichiers

## Statut
Accepte - 2026-03-12

## Contexte
Quand plusieurs sessions Claude Code travaillent en parallele, elles peuvent modifier les memes fichiers et creer des conflits. Un systeme de verrous souples permet d'avertir les sessions qu'un fichier est deja en cours de modification.

## Decision
Service `FileLockManager` avec locks souples (avertissement, pas de blocage). Les sessions declarent les fichiers qu'elles modifient, et le dashboard affiche les conflits potentiels.

## Implementation

### Service `FileLockManager`
- `acquire(filePath, sessionId)` — prend un lock, retourne `{ acquired, holders }`
- `release(filePath, sessionId)` — libere un lock
- `releaseAll(sessionId)` — libere tous les locks d'une session (deconnexion)
- `getLocks()` — retourne tous les locks actifs
- `getConflicts()` — retourne les fichiers avec 2+ holders
- Persiste dans le JsonStore (cle `locks`)

### Lock souple
- Un fichier peut avoir plusieurs holders (pas de blocage)
- L'acquisition retourne `acquired: true` meme si d'autres sessions tiennent le lock
- Le champ `holders` indique toutes les sessions qui tiennent le lock
- Un broadcast `lock:conflict` est emis quand un fichier a 2+ holders

### API REST
- `POST /api/locks` — `{ filePath, sessionId }` prend un lock
- `DELETE /api/locks` — `{ filePath, sessionId }` libere un lock
- `GET /api/locks` — liste tous les locks
- `GET /api/locks/conflicts` — liste les conflits

### Integration WsProtocol
- Message `lock` dans le protocole WS (terminal → serveur)
- Message `unlock` dans le protocole WS
- Auto-release a la deconnexion d'un terminal

## Fichiers
- `backend/src/services/file-lock-manager.js` — **nouveau**
- `backend/src/routes/locks.js` — **nouveau**
- `backend/src/index.js` — integration
- `backend/src/services/ws-protocol.js` — messages lock/unlock

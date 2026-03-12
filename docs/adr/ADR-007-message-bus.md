# ADR-007: Bus de Messages

## Statut
Accepte - 2026-03-12

## Contexte
Les sessions Claude Code n'ont pas de moyen de communiquer entre elles. Un bus de messages permet d'envoyer des messages entre sessions (alertes, requetes, informations) et de les consulter.

## Decision
Service `MessageBus` qui gere l'envoi et la reception de messages entre sessions, avec persistance et API REST.

## Implementation

### Service `MessageBus`
- `send(from, to, message)` — envoie un message (to = sessionId ou 'all')
- `getMessages(sessionId)` — messages pour une session (+ broadcasts)
- `getUnread(sessionId)` — messages non lus
- `markRead(messageId)` — marquer comme lu
- Persiste dans le JsonStore (cle `messages`)
- Types: `info`, `warning`, `error`, `request`

### API REST
- `POST /api/messages` — envoyer un message
- `GET /api/messages?to=<sessionId>` — messages pour une session
- `PUT /api/messages/:id/read` — marquer comme lu

### Integration WsProtocol
- Message `message` dans le protocole WS (terminal ↔ serveur)
- Notification temps reel au destinataire

## Fichiers
- `backend/src/services/message-bus.js` — **nouveau**
- `backend/src/routes/messages.js` — **nouveau**
- `backend/src/index.js` — integration
- `backend/src/services/ws-protocol.js` — messages entrants/sortants

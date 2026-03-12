# ADR-002: Protocole WebSocket

## Statut
Accepte - 2026-03-12

## Contexte
Le dashboard et les terminaux communiquent via WebSocket, mais sans distinction de type de client. Il faut un protocole clair pour identifier les clients dashboard (lecture seule, recoivent les broadcasts) et les clients terminaux (s'enregistrent, envoient des updates, heartbeat).

## Decision
**WsProtocol** - Service qui gere les connexions WebSocket avec distinction dashboard/terminal.

## Implementation
Fichier: `backend/src/services/ws-protocol.js`

### Messages entrants (terminal → serveur)
- `register` : enregistrement avec sessionId, name, directory
- `update` : mise a jour de la session (currentTask, status, action)
- `heartbeat` : signal de vie (reset du timer)
- `disconnect` : deconnexion volontaire

### Messages sortants (serveur → client)
- `init` : etat initial (recap) envoye a la connexion
- `registered` : confirmation d'enregistrement
- `updated` : confirmation de mise a jour
- `pong` : reponse au heartbeat
- `error` : message d'erreur

### Heartbeat
- Timeout configurable (defaut: 30s)
- Terminal sans heartbeat = deconnexion automatique
- La session est marquee `disconnected` (pas supprimee)

## Fichiers
- `backend/src/services/ws-protocol.js` — **nouveau fichier**
- `backend/src/index.js` — integration du WsProtocol

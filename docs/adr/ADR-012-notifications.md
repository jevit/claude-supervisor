# ADR-012: Systeme de Notifications

## Statut
Accepte - 2026-03-12

## Contexte
Les evenements importants (conflits, echecs de health check, changements d'environnement) doivent etre mis en evidence dans le dashboard avec un systeme de notifications (toasts, centre de notifications, compteur non-lu).

## Decision
Service `NotificationManager` cote backend qui collecte les evenements importants en notifications, et composant frontend `NotificationCenter` avec toasts.

## Implementation

### Service `NotificationManager`
- Ecoute les broadcasts et genere des notifications pour les evenements importants
- Chaque notification: `{ id, type, severity, title, message, read, timestamp }`
- Severites: `info`, `warning`, `error`
- Evenements qui generent des notifications:
  - `health:fail` → error
  - `conflict:detected` → warning
  - `env:changed` → info
  - `task:failed` → error
  - `session:registered` → info
- Persiste dans le JsonStore (cle `notifications`)

### API REST
- `GET /api/notifications` — liste (avec `?unread=true`)
- `PUT /api/notifications/:id/read` — marquer comme lue
- `PUT /api/notifications/read-all` — tout marquer comme lu
- `GET /api/notifications/count` — compteur non-lus

### Frontend
- Composant `NotificationCenter` dans la sidebar (icone + compteur)
- Toast notifications pour les notifications temps reel
- Panel deroulant avec la liste des notifications

## Fichiers
- `backend/src/services/notification-manager.js` — **nouveau**
- `backend/src/routes/notifications.js` — **nouveau**
- `backend/src/index.js` — integration
- `frontend/src/components/NotificationCenter.jsx` — **nouveau**
- `frontend/src/components/Toast.jsx` — **nouveau**
- `frontend/src/components/Sidebar.jsx` — integration NotificationCenter

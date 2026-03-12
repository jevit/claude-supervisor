# ADR-005: Timeline Unifiee

## Statut
Accepte - 2026-03-12

## Contexte
Les actions de chaque session sont stockees dans leur historique individuel. Il manque une vue chronologique globale de toutes les actions de toutes les sessions, ce qui est essentiel pour comprendre ce qui se passe a un instant donne.

## Decision
Ajouter un service `EventLog` qui collecte tous les evenements (sessions, agents, taches) dans un journal unifie, avec une API REST pour le consulter et un composant frontend Timeline.

## Implementation

### Service `EventLog`
- Collecte tous les broadcasts dans un journal chronologique
- Chaque evenement: `{ id, type, source, data, timestamp }`
- Limite configurable (defaut: 500 evenements)
- Persiste dans le JsonStore (cle `events`)

### API REST
- `GET /api/timeline` — liste des evenements (avec filtres query: `type`, `source`, `limit`)

### Frontend
- Nouvelle page `/timeline` accessible depuis la sidebar
- Liste chronologique inversee (plus recent en haut)
- Filtres par type d'evenement et par session
- Badge colore par type d'evenement

## Fichiers
- `backend/src/services/event-log.js` — **nouveau**
- `backend/src/routes/timeline.js` — **nouveau**
- `backend/src/index.js` — integration EventLog + route
- `frontend/src/pages/Timeline.jsx` — **nouveau**
- `frontend/src/components/Sidebar.jsx` — lien Timeline
- `frontend/src/App.jsx` — route /timeline

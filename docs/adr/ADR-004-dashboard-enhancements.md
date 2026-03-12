# ADR-004: Ameliorations Dashboard

## Statut
Accepte - 2026-03-12

## Contexte
Le hook WebSocket du dashboard a une reconnexion cassee : il ne retente pas la connexion. De plus, il n'y a pas d'indicateur de chargement ni d'etat de connexion visible pour l'utilisateur. L'evenement `init` envoye par le serveur n'est pas exploite.

## Decision
Réécrire `useWebSocket` avec reconnexion fonctionnelle et exposer l'etat de connexion. Ajouter des etats de chargement et un indicateur de connexion dans le dashboard.

## Implementation

### 1. Hook `useWebSocket` reecrit
- Reconnexion automatique avec backoff exponentiel (1s → 30s max)
- Expose `connectionState`: `connecting`, `connected`, `disconnected`
- Traite l'evenement `init` pour hydrater l'etat initial
- Cleanup propre a la destruction du composant

### 2. Indicateur de connexion
- Bandeau en haut du dashboard quand deconnecte
- Point colore dans la sidebar (vert/rouge)

### 3. Etats de chargement
- Skeleton/spinner au premier chargement du recap
- Message "Aucune session" seulement apres le chargement initial

## Fichiers modifies
- `frontend/src/services/websocket.js` — reecrit avec reconnexion et etat
- `frontend/src/pages/Dashboard.jsx` — loading states, init event
- `frontend/src/components/RecapPanel.jsx` — loading state
- `frontend/src/components/Sidebar.jsx` — indicateur de connexion
- `frontend/src/index.css` — styles pour les nouveaux etats

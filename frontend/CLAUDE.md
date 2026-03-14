# Frontend — Claude Supervisor

Dashboard React sur le port 3000, proxy vers le backend sur 3001.

## Commandes

```bash
npm run dev      # Vite dev server :3000
npm run build    # Build production → dist/
npm run preview  # Preview du build
```

## Pages

| Fichier | Route | Description |
|---------|-------|-------------|
| `Terminals.jsx` | `/terminals` | Vue simple + grille (1×2, 2×1, 2×2, 2×3), xterm.js |
| `Conflicts.jsx` | `/conflicts` | Conflits actifs + table des locks |
| `SharedContext.jsx` | `/context` | Contexte partagé clé-valeur |
| `Analytics.jsx` | `/analytics` | Métriques et stats sessions |
| `SquadLauncher.jsx` | `/squads` | Créer et lister les squads |
| `SquadView.jsx` | `/squads/:id` | Détail squad — membres, progress, broadcast |

## Composants

| Fichier | Rôle |
|---------|------|
| `Sidebar.jsx` | Navigation fixe gauche |
| `SessionCard.jsx` | Carte session avec contrôles, git, queue |
| `GitDiffPanel.jsx` | Visualiseur diff unifié (liste fichiers + hunks) |
| `MiniTimeline.jsx` | 15 derniers events dans la sidebar |
| `RecapPanel.jsx` | Compteurs sessions (actives, idle, erreur) |
| `ConnectionBanner.jsx` | Indicateur état WS |

## Services

- `src/services/websocket.js` — hook `useWebSocket(callback)` pour s'abonner aux events temps réel

## Design system

- `src/design-system.css` — variables CSS globales
- `src/index.css` — reset + classes utilitaires (`.card`, `.btn-primary`, `.status-badge`...)
- Thème : Tokyonight (`--bg-primary: #1a1b26`, `--accent: #8b5cf6`)

## Règles

- Pas de TypeScript
- Pas de librairie de charts externe — barres ASCII pour l'instant
- Les données temps réel arrivent par WS, les données initiales par fetch REST
- Le proxy Vite redirige `/api/*` et `/ws/*` vers `:3001` — pas de CORS à gérer en dev

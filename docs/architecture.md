# Architecture du Claude Supervisor

## Vue d'ensemble

Le Claude Supervisor est une application qui orchestre et surveille plusieurs sessions
Claude Code fonctionnant en parallele. Il fournit un dashboard web temps reel pour
visualiser l'etat de chaque session et un recap global.

## Composants

```
┌─────────────────────────────────────────────────────┐
│                  Dashboard Web (React)               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Recap    │  │ Sessions │  │  Agents           │  │
│  │  Global   │  │  Cards   │  │  Management       │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │ WebSocket + REST API
┌───────────────────────┴─────────────────────────────┐
│                  Backend (Node.js/Express)            │
│  ┌──────────────┐  ┌────────────────┐                │
│  │  Supervisor   │  │  Terminal      │                │
│  │  (orchestr.)  │  │  Tracker       │                │
│  └──────┬───────┘  └───────┬────────┘                │
│         │                  │                          │
│  ┌──────┴──────────────────┴────────┐                │
│  │         Agents Specialises        │                │
│  │  - Irritant Researcher            │                │
│  │  - (futurs agents...)             │                │
│  └───────────────────────────────────┘                │
└──────────────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     Terminal 1    Terminal 2    Terminal N
     (Claude)      (Claude)      (Claude)
```

## Flux de donnees

1. **Sessions** → Chaque terminal Claude Code s'enregistre aupres du backend
2. **Tracking** → Le TerminalTracker collecte l'etat de chaque session
3. **Broadcast** → Les mises a jour sont diffusees en WebSocket au dashboard
4. **Recap** → Le dashboard agrege et affiche un recap consolide
5. **Agents** → Les agents specialises analysent les patterns et irritants

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend  | React 18 + Vite |
| Backend   | Node.js + Express |
| Temps reel | WebSocket (ws) |
| API Claude | @anthropic-ai/sdk |
| Style     | CSS custom (dark theme) |

## Ports

- Frontend dev: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- WebSocket: `ws://localhost:3001`

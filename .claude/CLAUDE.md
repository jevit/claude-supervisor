# Claude Supervisor - Project Configuration

## Project Overview
Application de supervision de sessions Claude Code en parallèle avec dashboard web temps réel,
gestion de squads multi-agents, et serveur MCP intégré.

## Architecture
- **Backend**: Node.js + Express + WebSocket (port 3001)
- **Frontend**: React + Vite (port 3000, proxy vers backend)
- **MCP**: Serveur stdio exposant les outils `supervisor_*`
- **CLI**: `cli/session-reporter.js` — connecte un terminal au supervisor

## Conventions
- Code en anglais, commentaires et documentation en français
- Nommage: camelCase pour JS, kebab-case pour fichiers
- Pas de TypeScript (simplicité)
- Pas de mock en tests — toujours tester contre le vrai backend

## Commandes
```bash
cd backend && npm run dev      # Backend :3001
cd frontend && npm run dev     # Frontend :3000
```

## Structure clé
- `backend/src/services/terminal-manager.js` — PTY node-pty
- `backend/src/services/squad-manager.js` — Squads multi-agents
- `backend/src/services/ws-protocol.js` — broadcast() central WS
- `frontend/src/pages/Terminals.jsx` — Vue grille multi-terminaux
- `frontend/src/pages/SquadLauncher.jsx` + `SquadView.jsx` — Squad mode
- `mcp/supervisor-mcp.js` — Outils MCP pour sessions Claude Code
- `docs/` — Documentation et ADRs

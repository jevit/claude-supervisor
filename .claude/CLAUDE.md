# Claude Supervisor - Project Configuration

## Project Overview
Application de supervision de sessions Claude Code en parallele avec dashboard web temps reel.

## Architecture
- **Backend**: Node.js + Express + WebSocket (port 3001)
- **Frontend**: React + Vite (port 3000, proxy vers backend)
- **Communication temps reel**: WebSocket pour les mises a jour du dashboard

## Conventions
- Code en anglais, commentaires et documentation en francais
- Nommage: camelCase pour JS, kebab-case pour fichiers
- Pas de TypeScript pour l'instant (simplicite)

## Commandes
- Backend dev: `cd backend && npm run dev`
- Frontend dev: `cd frontend && npm run dev`
- Install: `cd backend && npm install && cd ../frontend && npm install`

## Structure cle
- `backend/src/services/supervisor.js` - Orchestrateur principal des agents
- `backend/src/services/terminal-tracker.js` - Suivi des sessions terminal
- `backend/src/services/agents/` - Agents specialises (recherche irritants, etc.)
- `frontend/src/pages/Dashboard.jsx` - Vue globale avec recap
- `docs/` - Documentation du projet

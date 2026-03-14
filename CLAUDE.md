# Claude Supervisor

Application de supervision de sessions Claude Code en parallèle, avec dashboard web temps réel, gestion de squads multi-agents, et serveur MCP intégré.

## Commandes essentielles

```bash
# Installation
cd backend && npm install
cd ../frontend && npm install
cd ../mcp && npm install

# Développement (2 terminaux)
cd backend && npm run dev      # API + WebSocket sur :3001
cd frontend && npm run dev     # Dashboard React sur :3000
```

## Architecture

```
claude-supervisor/
├── backend/          Node.js + Express + WebSocket (port 3001)
├── frontend/         React + Vite (port 3000, proxy → backend)
├── mcp/              Serveur MCP (stdio) — outils supervisor_*
├── cli/              session-reporter.js — CLI pour les sessions
├── hooks/            post-tool-reporter.js — hook PostToolUse
└── data/             Persistance JSON (ignoré par git)
```

## Conventions

- **Langue** : code en anglais, commentaires et doc en français
- **Nommage** : camelCase JS, kebab-case fichiers
- **Pas de TypeScript** — simplicité avant tout
- **Pas de mock en tests** — toujours tester contre le vrai backend

## Services backend clés

| Service | Fichier | Rôle |
|---------|---------|------|
| TerminalManager | `backend/src/services/terminal-manager.js` | PTY node-pty, spawn/kill/resize |
| SquadManager | `backend/src/services/squad-manager.js` | Orchestration multi-agents |
| WsProtocol | `backend/src/services/ws-protocol.js` | WebSocket + broadcast central |
| EventLog | `backend/src/services/event-log.js` | Journal unifié de tous les events |
| FileLockManager | `backend/src/services/file-lock-manager.js` | Locks soft sur fichiers |
| SharedContext | `backend/src/services/shared-context.js` | Clé-valeur partagé inter-sessions |
| ConflictDetector | `backend/src/services/conflict-detector.js` | Détection conflits fichiers |
| HealthChecker | `backend/src/services/health-checker.js` | Checks périodiques |
| JsonStore | `backend/src/services/json-store.js` | Persistance JSON avec debounce |

## Routes API

```
GET/POST   /api/terminals          Gestion PTY
GET/POST   /api/squads             Squads multi-agents
GET/POST   /api/sessions           Sessions actives
GET/POST   /api/context            Contexte partagé
GET        /api/timeline           Journal d'events
GET/POST   /api/locks              Locks de fichiers
GET        /api/conflicts          Conflits détectés
GET/POST   /api/health-checks      Health checks
GET/POST   /api/messages           Messages inter-sessions
GET        /api/git/diff/:id       Diff Git d'un terminal
```

## Pages frontend

| Route | Page | Description |
|-------|------|-------------|
| `/terminals` | Terminals.jsx | Vue simple + grille multi-terminaux (1×2, 2×2, 2×3) |
| `/conflicts` | Conflicts.jsx | Conflits actifs + locks |
| `/context` | SharedContext.jsx | Contexte partagé clé-valeur |
| `/analytics` | Analytics.jsx | Métriques et stats |
| `/squads` | SquadLauncher.jsx | Créer et gérer des squads |
| `/squads/:id` | SquadView.jsx | Détail d'un squad |

## MCP — outils disponibles

Les sessions Claude Code peuvent appeler :
- `supervisor_set_status` — mettre à jour son statut
- `supervisor_set_thinking` — signaler une réflexion en cours
- `supervisor_report_task` — déclarer une tâche
- `supervisor_log_action` — journaliser une action
- `supervisor_get_context` — lire le contexte partagé
- `supervisor_set_context` — écrire dans le contexte partagé
- `supervisor_lock_file` / `supervisor_unlock_file`
- `supervisor_send_message` — envoyer un message à une autre session
- `supervisor_get_sessions` — lister les sessions actives

## WebSocket events

`broadcast()` est le hub central — tout event loggé génère automatiquement :
une entrée dans EventLog, une analyse de conflits, et une notification si règle active.

Events principaux : `session:*`, `terminal:output`, `lock:*`, `conflict:*`, `context:*`, `squad:*`

## Points d'attention

- `node-pty` requiert un rebuild natif sur Windows : `npm rebuild node-pty` si erreur au démarrage
- Le fichier `data/supervisor-data.json` grossit — à purger périodiquement (ignoré par git)
- `backend/.claude/settings.local.json` est per-machine, ne pas commiter

# Claude Supervisor

Dashboard web temps réel pour superviser plusieurs sessions **Claude Code** en parallèle — terminaux PTY, squads multi-agents, diff Git, détection de conflits, contexte partagé et bien plus.

![Node.js](https://img.shields.io/badge/Node.js-20+-green) ![React](https://img.shields.io/badge/React-18-blue) ![WebSocket](https://img.shields.io/badge/WebSocket-ws8-purple)

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Démarrage](#démarrage)
- [Pages et interface](#pages-et-interface)
- [API REST](#api-rest)
- [WebSocket](#websocket)
- [MCP Server](#mcp-server)
- [CLI — session-reporter](#cli--session-reporter)
- [Hooks Claude Code](#hooks-claude-code)
- [Persistance des sessions](#persistance-des-sessions)
- [Squads multi-agents](#squads-multi-agents)
- [Git intégré](#git-intégré)
- [Configuration](#configuration)
- [Structure du projet](#structure-du-projet)

---

## Fonctionnalités

| Catégorie | Fonctionnalité |
|-----------|---------------|
| **Terminaux** | Lancement de sessions Claude Code via node-pty, vue simple ou grille (1×2, 2×1, 2×2, 2×3) |
| **Persistance** | Sauvegarde automatique de l'état des sessions — reprise après redémarrage |
| **Git** | Diff unifié ou côte-à-côte, arbre de fichiers, stage/unstage/discard/commit depuis la UI |
| **Multi-agents** | Squads de sessions coordonnées avec templates, broadcast de messages, suivi de progression |
| **Conflits** | Détection de fichiers modifiés par plusieurs sessions simultanément, heatmap de conflits |
| **Contexte partagé** | Store clé-valeur injecté automatiquement dans le prompt de chaque nouvelle session |
| **Temps réel** | WebSocket central, journal d'événements unifié, feed d'activité live |
| **MCP** | 14 outils MCP exposés aux sessions Claude Code (status, locks, messages, git…) |
| **Notifications** | Toasts et centre de notifications avec règles configurables |
| **Santé** | Health checks périodiques configurables par commande |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Dashboard React                    │
│   (Vite :3000 — proxy vers backend :3001)           │
│                                                     │
│  Terminals  Squads  Conflicts  Context  Analytics   │
└──────────────────────┬──────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────┐
│              Backend Node.js + Express               │
│                    (port 3001)                      │
│                                                     │
│  TerminalManager  SquadManager  ConflictDetector    │
│  FileLockManager  MessageBus   HealthChecker        │
│  SharedContext    EventLog     GitOrchestrator      │
│  EnvWatcher       JsonStore    WsProtocol           │
└──────┬─────────────────────────────────┬────────────┘
       │ node-pty                        │ stdio
┌──────▼──────┐                 ┌───────▼────────┐
│  Sessions   │                 │   MCP Server   │
│ Claude Code │◄────────────────│  supervisor_*  │
│  (PTY)      │  WS/HTTP        └───────────────-┘
└─────────────┘
```

**Stack :**
- **Backend** : Node.js + Express + `ws` (WebSocket) + `node-pty`
- **Frontend** : React 18 + Vite + xterm.js + React Router
- **MCP** : `@modelcontextprotocol/sdk` (stdio)
- **Persistance** : JSON debounced (`data/supervisor-data.json`)
- **SDK Anthropic** : optionnel (supervision fonctionne sans clé API)

---

## Prérequis

- **Node.js 20+**
- **Git** (pour les fonctionnalités de diff)
- **Claude Code CLI** installé (`npm install -g @anthropic-ai/claude-code`)
- Windows : outils de build natifs pour `node-pty` (`npm install -g windows-build-tools` ou Visual Studio Build Tools)

---

## Installation

```bash
# Cloner le dépôt
git clone https://github.com/jevit/claude-supervisor.git
cd claude-supervisor

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# MCP (optionnel)
cd ../mcp && npm install
```

> **Windows — node-pty :** si une erreur apparaît au démarrage du backend :
> ```bash
> cd backend && npm rebuild node-pty
> ```

---

## Démarrage

Lancer deux terminaux en parallèle :

```bash
# Terminal 1 — Backend API + WebSocket
cd backend && npm run dev

# Terminal 2 — Frontend React
cd frontend && npm run dev
```

Ouvrir **http://localhost:3000** dans le navigateur.

### Variables d'environnement (backend)

Créer un fichier `backend/.env` :

```env
PORT=3001
NODE_ENV=development
MAX_EVENTS=2000
STORE_DEBOUNCE_MS=500
# ANTHROPIC_API_KEY=sk-ant-...   (optionnel — supervision sans clé possible)
```

---

## Pages et interface

| Route | Page | Description |
|-------|------|-------------|
| `/terminals` | **Terminaux** | Lancer et piloter des sessions Claude Code. Vue simple ou grille multi-terminaux. Onglets Terminal / Git Diff par session. |
| `/squads` | **Squads** | Créer et gérer des groupes de sessions coordonnées (multi-agents). |
| `/squads/:id` | **Détail squad** | Membres, avancement, broadcast de messages à tous les agents. |
| `/conflicts` | **Conflits** | Vue globale des fichiers modifiés par toutes les sessions actives, heatmap de conflits, table des locks. |
| `/context` | **Contexte partagé** | Éditer le store clé-valeur injecté dans les prompts Claude. |
| `/analytics` | **Analytics** | Métriques de sessions (actions, durée, statuts). |
| `/orchestrator` | **Orchestrateur** | Interface d'orchestration via SDK Anthropic (optionnel). |

### Panneau Git Diff (par terminal)

- Vue **unifiée** ou **côte-à-côte** (avant / après)
- **Arbre de fichiers** avec badges de statut colorés (S=stagé, M=modifié, D=supprimé, ?=non-suivi)
- Actions directes : **Stage**, **Unstage**, **Discard** (confirmation en deux clics), **Commit**
- **Feed d'activité live** : détecte les écritures de Claude en temps réel (`file:activity`)
- Historique des commits avec diff par commit

---

## API REST

### Terminaux

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/terminals` | Liste tous les terminaux (running + ghost) |
| `POST` | `/api/terminals` | Lancer un nouveau terminal Claude Code |
| `GET` | `/api/terminals/:id` | Infos d'un terminal |
| `GET` | `/api/terminals/:id/output` | Buffer de sortie |
| `POST` | `/api/terminals/:id/write` | Envoyer du texte (clavier) |
| `POST` | `/api/terminals/:id/resize` | Redimensionner (cols/rows) |
| `POST` | `/api/terminals/:id/resume` | Reprendre une session interrompue (ghost) |
| `PATCH` | `/api/terminals/:id` | Renommer |
| `DELETE` | `/api/terminals/:id` | Arrêter |
| `GET` | `/api/terminals/:id/diff` | Git diff du répertoire du terminal |
| `POST` | `/api/terminals/cleanup` | Supprimer les terminaux arrêtés |

### Git

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/git/diff` | Diff d'un répertoire (ou d'un commit) |
| `GET` | `/api/git/all-changes` | Vue globale de tous les terminaux actifs |
| `POST` | `/api/git/stage` | Stager un fichier |
| `POST` | `/api/git/stage-all` | Stager tous les fichiers |
| `POST` | `/api/git/unstage` | Unstager un fichier |
| `POST` | `/api/git/discard` | Annuler les modifications d'un fichier |
| `POST` | `/api/git/commit` | Commiter les fichiers stagés |
| `GET` | `/api/git/branches` | Branches d'un répertoire |
| `GET/POST` | `/api/git/queue` | File d'attente de commits |

### Autres

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET/POST` | `/api/squads` | Squads multi-agents |
| `GET/POST` | `/api/sessions` | Sessions CLI (session-reporter) |
| `GET` | `/api/timeline` | Journal d'événements unifié |
| `GET/POST` | `/api/locks` | File locks |
| `GET/POST` | `/api/messages` | Messages inter-sessions |
| `GET/POST` | `/api/health-checks` | Health checks |
| `GET` | `/api/conflicts` | Conflits détectés |
| `GET/POST` | `/api/context` | Contexte partagé |
| `GET/POST` | `/api/env` | Variables d'environnement surveillées |
| `GET` | `/api/health` | Santé du serveur |
| `GET` | `/api/settings` | Configuration chargée |

---

## WebSocket

Le backend expose un WebSocket sur `ws://localhost:3001`.

### Événements émis par le serveur

| Événement | Description |
|-----------|-------------|
| `terminal:output` | Sortie PTY d'un terminal |
| `terminal:spawned` | Nouveau terminal lancé |
| `terminal:exited` | Terminal arrêté |
| `terminal:resumed` | Session ghost reprise |
| `terminal:attention` | Terminal attend une action utilisateur |
| `terminal:renamed` | Terminal renommé |
| `session:registered` | Nouvelle session CLI |
| `session:updated` | Mise à jour session CLI |
| `session:removed` | Session CLI supprimée |
| `file:activity` | Écriture de fichier détectée (Write/Edit/MultiEdit) |
| `lock:acquired` | Lock fichier acquis |
| `lock:released` | Lock fichier libéré |
| `conflict:detected` | Conflit de fichiers entre sessions |
| `squad:*` | Événements squad (started, member:added, progress…) |
| `context:updated` | Contexte partagé mis à jour |
| `message:sent` | Message inter-sessions |

### Événements envoyés par le client (terminal)

| Événement | Description |
|-----------|-------------|
| `heartbeat` | Keepalive + mise à jour d'état d'une session CLI |
| `lock:request` | Demande de lock fichier |
| `lock:release` | Libération de lock |
| `message:send` | Envoi d'un message à une session |

---

## MCP Server

Le serveur MCP expose 14 outils aux sessions Claude Code pour interagir avec le supervisor.

### Configuration (`~/.claude/mcp.json` ou `.mcp.json` à la racine)

```json
{
  "mcpServers": {
    "claude-supervisor": {
      "command": "node",
      "args": ["/chemin/vers/claude-supervisor/mcp/supervisor-mcp.js"],
      "env": {
        "SUPERVISOR_URL": "http://localhost:3001"
      }
    }
  }
}
```

### Outils disponibles

| Outil | Description |
|-------|-------------|
| `supervisor_set_status` | Mettre à jour le statut de la session |
| `supervisor_set_thinking` | Signaler une réflexion en cours |
| `supervisor_report_task` | Déclarer la tâche courante |
| `supervisor_log_action` | Journaliser une action dans l'EventLog |
| `supervisor_get_context` | Lire le contexte partagé |
| `supervisor_set_context` | Écrire dans le contexte partagé |
| `supervisor_lock_file` | Acquérir un lock soft sur un fichier |
| `supervisor_unlock_file` | Libérer un lock |
| `supervisor_send_message` | Envoyer un message à une autre session |
| `supervisor_get_messages` | Lire les messages reçus |
| `supervisor_get_sessions` | Lister les sessions actives |
| `supervisor_get_conflicts` | Lire les conflits détectés |
| `supervisor_health_status` | Statut des health checks |
| `supervisor_git_enqueue` | Ajouter un commit à la file Git |

---

## CLI — session-reporter

Connecte un terminal existant au supervisor via WebSocket pour le déclarer comme session active.

```bash
node cli/session-reporter.js
```

**Commandes interactives :**

```
task <description>      Déclarer la tâche en cours
action <description>    Logger une action
status <idle|active>    Changer le statut
thinking <texte>        Signaler une réflexion
info <texte>            Log informatif
quit                    Déconnecter
```

**Usage programmatique :**

```js
const { SessionReporter } = require('./cli/session-reporter');

const reporter = new SessionReporter({
  name: 'Mon agent',
  url: 'ws://localhost:3001',
});
await reporter.connect();
reporter.reportTask('Refactoring du module auth');
reporter.logAction('Lecture de auth.js');
```

---

## Hooks Claude Code

Le hook `hooks/post-tool-reporter.js` se connecte comme hook `PostToolUse` dans Claude Code pour reporter automatiquement chaque utilisation d'outil au supervisor.

### Configuration (`~/.claude/settings.json`)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node /chemin/vers/claude-supervisor/hooks/post-tool-reporter.js"
          }
        ]
      }
    ]
  }
}
```

Les outils `Write`, `Edit`, `MultiEdit` et `NotebookEdit` déclenchent automatiquement un événement `file:activity` qui rafraîchit le panneau Git Diff en temps réel.

---

## Persistance des sessions

Quand le backend redémarre, les sessions PTY sont perdues — mais leur état est sauvegardé.

### Comment ça marche

1. À chaque spawn, rename, exit et au shutdown, `terminal-manager.js` sauvegarde les sessions **actives** dans `data/supervisor-data.json` (buffer des 20 000 derniers caractères + metadata)
2. Au redémarrage du backend, `loadPersistedSessions()` restaure ces sessions comme entrées **ghost**
3. Dans la UI, les sessions ghost apparaissent avec un badge **"interrompu"** (orange) et un bouton **↺**
4. Cliquer ↺ appelle `POST /api/terminals/:id/resume` qui relance un nouveau PTY avec les mêmes paramètres, en conservant l'ID et le buffer

Les sessions ghost expirent après **7 jours**.

---

## Squads multi-agents

Un squad est un groupe de sessions Claude Code coordonnées autour d'une tâche commune.

### Créer un squad

```http
POST /api/squads
{
  "name": "Refactoring Auth",
  "description": "Migrer l'authentification vers JWT",
  "members": [
    { "name": "Backend", "directory": "/projet/backend", "prompt": "Refactorise le module auth..." },
    { "name": "Tests",   "directory": "/projet/tests",   "prompt": "Écris les tests pour le nouveau auth..." }
  ]
}
```

### Templates

Des templates préconfigurés sont disponibles via `/api/squad-templates` pour des cas d'usage courants (review de code, migration, tests…).

### Worktrees Git

Chaque membre d'un squad peut travailler sur un **worktree Git** isolé (branche dédiée), évitant les conflits de fichiers entre agents.

---

## Git intégré

### Diff depuis la UI

Le panneau Git Diff de chaque terminal permet :
- Visualiser les **fichiers modifiés** avec leur statut (stagé / non-stagé / non-suivi)
- Voir le **diff complet** en vue unifiée ou côte-à-côte
- Naviguer dans l'**historique des commits**
- Effectuer des actions Git sans quitter le dashboard :

```
+ Stage     →  git add -- <fichier>
− Unstage   →  git restore --staged -- <fichier>
✕ Discard   →  git restore -- <fichier>   (ou git clean -f pour les non-suivis)
+ Stage all →  git add -A
⎇ Commit    →  git commit -m "<message>"
```

### Vue globale cross-sessions

La page **Conflits** agrège les modifications de tous les terminaux actifs et identifie les fichiers touchés par plusieurs sessions simultanément.

---

## Configuration

### `backend/.env`

```env
PORT=3001
NODE_ENV=development
MAX_EVENTS=2000          # Taille maximale du journal d'événements
STORE_DEBOUNCE_MS=500    # Délai de debounce pour la persistance JSON
WORKTREES_DIR=           # Répertoire des worktrees Git (optionnel)
ANTHROPIC_API_KEY=       # Clé API Anthropic (optionnel)
```

### `.claude/settings.json` (racine du projet)

Paramètres chargés au démarrage du backend pour configurer les règles d'approbation et autres options.

---

## Structure du projet

```
claude-supervisor/
├── backend/                    # API + WebSocket (port 3001)
│   └── src/
│       ├── index.js            # Point d'entrée
│       ├── routes/             # Endpoints Express
│       │   ├── terminals.js    # PTY terminals
│       │   ├── git.js          # Git diff & actions
│       │   ├── squads.js       # Squads multi-agents
│       │   ├── sessions.js     # Sessions CLI
│       │   ├── timeline.js     # Journal d'événements
│       │   ├── locks.js        # File locks
│       │   ├── messages.js     # Messages inter-sessions
│       │   ├── conflicts.js    # Conflits
│       │   ├── context.js      # Contexte partagé
│       │   ├── health-checks.js
│       │   └── env.js
│       └── services/           # Logique métier
│           ├── terminal-manager.js    # node-pty
│           ├── squad-manager.js       # Orchestration squads
│           ├── ws-protocol.js         # broadcast() central
│           ├── event-log.js           # Journal unifié
│           ├── json-store.js          # Persistance JSON
│           ├── file-lock-manager.js   # Locks fichiers
│           ├── message-bus.js         # Messages inter-sessions
│           ├── conflict-detector.js   # Détection conflits
│           ├── shared-context.js      # Contexte partagé
│           ├── health-checker.js      # Health checks
│           ├── git-utils.js           # Utilitaires Git
│           ├── git-orchestrator.js    # File de commits Git
│           ├── env-watcher.js         # Watcher de config
│           ├── worktree-manager.js    # Worktrees Git
│           └── supervisor.js          # SDK Anthropic (optionnel)
│
├── frontend/                   # Dashboard React (port 3000)
│   └── src/
│       ├── pages/
│       │   ├── Terminals.jsx       # Terminaux PTY
│       │   ├── Conflicts.jsx       # Conflits & locks
│       │   ├── SharedContext.jsx   # Contexte partagé
│       │   ├── Analytics.jsx       # Métriques
│       │   ├── SquadLauncher.jsx   # Créer un squad
│       │   └── SquadView.jsx       # Détail squad
│       └── components/
│           ├── GitDiffPanel.jsx    # Panneau Git Diff
│           ├── Sidebar.jsx         # Navigation
│           ├── SessionCard.jsx     # Carte session
│           ├── ConnectionBanner.jsx
│           ├── NotificationCenter.jsx
│           └── Toast.jsx
│
├── mcp/
│   └── supervisor-mcp.js       # Serveur MCP stdio (14 outils)
│
├── cli/
│   └── session-reporter.js     # CLI de reporting de session
│
├── hooks/
│   └── post-tool-reporter.js   # Hook PostToolUse Claude Code
│
├── docs/                       # Documentation & ADRs (ADR-000 à ADR-012)
└── data/                       # Persistance JSON (ignoré par git)
```

---

## Développement

### Conventions

- Code en **anglais**, commentaires en **français**
- **camelCase** pour les variables/fonctions JS, **kebab-case** pour les fichiers
- Pas de TypeScript — simplicité avant tout
- Pas de mock en tests — toujours tester contre le vrai backend
- SDKs externes importés avec `try/catch` pour rester optionnels
- IDs générés avec `require('crypto').randomUUID()`

### Tests

```bash
cd backend && npm test       # Tests Jest backend
cd frontend && npx playwright test   # Tests E2E Playwright
```

### Ajouter un événement WebSocket

Tout passe par `broadcast()` dans `ws-protocol.js` — ne jamais envoyer de WS directement. Le broadcast logue automatiquement dans l'EventLog, analyse les conflits et génère les notifications.

```js
broadcast('mon:event', { sessionId, ...data });
```

---

## Licence

MIT

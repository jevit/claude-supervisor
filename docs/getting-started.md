# Guide de demarrage

## Prerequis
- Node.js >= 18
- npm >= 9

## Installation

```bash
cd claude-supervisor

# Backend
cd backend && npm install && cp .env.example .env

# Frontend
cd ../frontend && npm install

# MCP Server
cd ../mcp && npm install
```

## Lancement

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Dashboard accessible sur `http://localhost:3000`

## Integration avec Claude Code

### Comment le terminal communique avec le dashboard

Trois mecanismes assurent la liaison temps reel entre les terminaux Claude Code et le dashboard :

```
Terminal Claude Code
    |
    +---> MCP Server (tools explicites + heartbeat 30s)
    |         |
    |         +---> HTTP POST /api/sessions/:id/heartbeat
    |         +---> HTTP POST /api/sessions (auto-registration)
    |
    +---> Hook PostToolUse (automatique, apres chaque outil)
              |
              +---> HTTP PUT /api/sessions/:id/heartbeat
                    (avec nom du tool + fichier concerne)
```

**MCP Server** : Appele quand Claude Code utilise un tool `supervisor_*`. Envoie aussi un heartbeat toutes les 30 secondes pour garder la session "active".

**Hook PostToolUse** : Appele automatiquement par Claude Code apres CHAQUE action (Read, Write, Edit, Bash...) sans intervention de Claude. Envoie l'action au superviseur (ex: "Edit: server.js").

### MCP Server (recommande)
Le fichier `.mcp.json` a la racine configure automatiquement le MCP server.
Chaque session Claude Code lancee dans ce workspace se connecte automatiquement au superviseur.

Fonctionnalites MCP (21 tools):
- Enregistrement automatique de la session
- Rapport de tache, actions, statut, reflexion
- Consultation des autres sessions et conflits
- Verrouillage de fichiers
- Messagerie inter-sessions
- Contexte partage
- File d'attente de commits Git
- **Heartbeat periodique (30s)** pour maintenir le statut "active"

### Hook automatique PostToolUse
Configure dans `.claude/settings.json`, le hook `PostToolUse` appelle le script `hooks/post-tool-reporter.js` apres chaque action de Claude Code.

Donnees envoyees au superviseur :
- Nom de l'outil utilise (Read, Write, Edit, Bash, Glob, Grep...)
- Fichier concerne (ex: "Edit: server.js")
- Timestamp
- Repertoire du projet

Configuration (deja en place dans `.claude/settings.json`) :
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/post-tool-reporter.js"
          }
        ]
      }
    ]
  }
}
```

Pour utiliser dans un autre projet, copiez le script `hooks/post-tool-reporter.js` et ajoutez la configuration hooks dans votre `.claude/settings.json`.

### Endpoint Heartbeat
```
PUT /api/sessions/:id/heartbeat
Body: { action?, directory?, tool?, timestamp? }
```
- Si la session n'existe pas, elle est auto-enregistree
- Si elle existe, son status passe a "active" et lastUpdate est mis a jour
- L'action est enregistree dans l'historique

### CLI Reporter (alternative)
```bash
# Lancement interactif
node cli/session-reporter.js --name "Ma Session"

# Commandes disponibles
task <description>     # Met a jour la tache en cours
action <description>   # Enregistre une action
status <active|idle>   # Change le statut
thinking <description> # Etat de reflexion
info                   # Infos de la session
quit                   # Deconnexion
```

### Usage programmatique
```js
const { SessionReporter } = require('./cli/session-reporter');
const reporter = new SessionReporter({ name: 'API Work' });
reporter.connect();
reporter.updateTask('Refactoring auth module');
```

## Pages du Dashboard

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Recap global, sessions actives, mini-timeline |
| Agents | `/agents` | Creer/supprimer des agents |
| Timeline | `/timeline` | Journal chronologique de tous les evenements |
| Conflits | `/conflicts` | Locks de fichiers et conflits detectes |
| Health Checks | `/health` | Checks periodiques (build, tests, lint) |
| Contexte | `/context` | Informations partagees entre sessions |
| Messages | `/messages` | Messagerie inter-sessions |
| Irritants | `/irritants` | Recherche de points de friction UX |
| Regles d'Alertes | `/alerts` | Configurer les notifications |
| Analytics | `/analytics` | Historique et statistiques des sessions |
| Mode Superviseur | `/supervisor` | Delegation automatique de taches |

## API REST

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | Etat du serveur |
| GET | `/api/sessions` | Sessions actives |
| GET | `/api/sessions/recap` | Recap consolide |
| PUT | `/api/sessions/:id/heartbeat` | Heartbeat + action automatique |
| POST | `/api/sessions/:id/message` | Envoyer un message a une session |
| GET/POST | `/api/agents` | Liste / creer un agent |
| DELETE | `/api/agents/:id` | Supprimer un agent |
| GET/POST | `/api/tasks` | Liste / assigner une tache |
| GET | `/api/timeline` | Evenements (filtres: type, source, limit) |
| GET/POST | `/api/locks` | Locks de fichiers |
| GET | `/api/locks/conflicts` | Fichiers en conflit |
| GET/POST | `/api/messages` | Messages inter-sessions |
| GET/POST | `/api/health-checks` | Health checks |
| GET | `/api/conflicts` | Conflits detectes |
| GET/POST | `/api/context` | Contexte partage |
| GET | `/api/env/watches` | Fichiers surveilles |
| GET | `/api/env/changes` | Changements detectes |
| GET | `/api/notifications` | Notifications |
| GET/POST/DELETE | `/api/notifications/rules` | Regles d'alertes configurables |
| GET/POST | `/api/git/queue` | File d'attente de commits |
| GET | `/api/git/branches` | Branches actives |
| GET | `/api/irritants` | Irritants connus |
| POST | `/api/irritants/analyze` | Analyse IA des irritants |
| GET/POST | `/api/supervisor/queue` | File de delegation |
| GET | `/api/supervisor/status` | Statut mode superviseur |
| POST | `/api/supervisor/toggle` | Activer/desactiver mode auto |

## WebSocket

Connexion: `ws://localhost:3001`

Evenements temps reel: session:*, agent:*, task:*, lock:*, conflict:*, health:*, env:*, message:*, notification:*, supervisor:*

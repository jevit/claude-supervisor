# Backend — Claude Supervisor

API REST + WebSocket sur le port 3001.

## Commandes

```bash
npm run dev    # nodemon, redémarre sur changement
npm start      # production
```

## Structure

```
src/
├── index.js              Point d'entrée — monte tous les services et routes
├── services/             Logique métier
│   ├── terminal-manager.js   PTY node-pty (spawn, kill, resize, write)
│   ├── squad-manager.js      Orchestration squads multi-agents
│   ├── ws-protocol.js        WebSocket + broadcast() central
│   ├── event-log.js          Journal d'events (MAX_EVENTS depuis .env)
│   ├── json-store.js         Persistance JSON debounced → data/
│   ├── terminal-tracker.js   Suivi sessions CLI (session-reporter)
│   ├── file-lock-manager.js  Locks soft sur fichiers
│   ├── message-bus.js        Messages inter-sessions
│   ├── health-checker.js     Checks périodiques configurables
│   ├── conflict-detector.js  Analyse conflits de fichiers
│   ├── shared-context.js     Clé-valeur partagé (lu par MCP)
│   ├── env-watcher.js        Watcher de fichiers de config
│   ├── approval-rules.js     Règles d'approbation automatique
│   └── supervisor.js         Orchestrateur Anthropic SDK (optionnel)
└── routes/               Endpoints Express
    ├── terminals.js      CRUD terminaux PTY
    ├── squads.js         CRUD squads
    ├── sessions.js       Sessions CLI
    ├── context.js        Contexte partagé
    ├── timeline.js       Journal d'events
    ├── locks.js          File locks
    ├── conflicts.js      Conflits détectés
    ├── health-checks.js  Health checks
    ├── messages.js       Messages inter-sessions
    ├── git.js            Diff et status Git
    ├── tasks.js          File de tâches
    └── env.js            Variables d'environnement surveillées
```

## Variables d'environnement (`.env`)

```env
PORT=3001
NODE_ENV=development
MAX_EVENTS=2000
STORE_DEBOUNCE_MS=500
# ANTHROPIC_API_KEY=sk-ant-...   (optionnel)
```

## Règles

- `broadcast()` dans `ws-protocol.js` est le hub central — ne pas envoyer de WS autrement
- Les SDKs externes (Anthropic) sont importés avec try/catch pour rester optionnels
- `require('crypto').randomUUID()` pour les IDs, pas le package uuid
- Données persistées dans `data/supervisor-data.json` (ignoré par git)

## node-pty sur Windows

Si erreur au démarrage :
```bash
npm rebuild node-pty
```

# ADR-003: CLI Reporter Script

## Statut
Accepte - 2026-03-12

## Contexte
Les terminaux Claude Code doivent pouvoir s'enregistrer aupres du superviseur et envoyer des mises a jour en temps reel. Il faut un script leger qui s'execute a cote de chaque session Claude Code, se connecte au superviseur via WebSocket, et rapporte l'activite.

## Alternatives considerees

### 1. Hook Claude Code natif
- (+) Integration directe, pas de process supplementaire
- (-) Claude Code n'expose pas d'API de hooks pour ca

### 2. Script standalone avec WebSocket
- (+) Independant, peut etre lance manuellement ou via wrapper
- (+) Reconnexion automatique si le serveur redemarre
- (+) Leger, zero dependance externe (utilise le ws natif du projet)
- (-) Necessite d'etre lance separement

### 3. Plugin terminal (tmux, etc.)
- (+) Integration shell directe
- (-) Dependance a un multiplexeur specifique

## Decision
**Script standalone** (`cli/session-reporter.js`) qui se connecte au superviseur via WebSocket.

## Implementation

### Fichier: `cli/session-reporter.js`

Script executable qui:
1. Se connecte au superviseur WebSocket (defaut: `ws://localhost:3001`)
2. S'enregistre avec un sessionId unique, nom et repertoire courant
3. Envoie des heartbeats reguliers (toutes les 10s)
4. Accepte des commandes stdin pour rapporter l'activite:
   - `task <description>` — met a jour la tache en cours
   - `action <description>` — enregistre une action
   - `status <active|idle|error>` — change le statut
   - `thinking <description>` — met a jour l'etat de reflexion
   - `quit` — deconnexion propre
5. Reconnexion automatique en cas de deconnexion (backoff exponentiel)
6. Graceful shutdown sur SIGINT/SIGTERM

### Usage
```bash
# Lancement simple (genere un sessionId automatique)
node cli/session-reporter.js

# Avec options
node cli/session-reporter.js --name "Frontend" --url ws://localhost:3001

# Depuis un repertoire de travail specifique
cd /path/to/project && node /path/to/cli/session-reporter.js --name "API Work"
```

### Mode programmatique
Le script exporte aussi une classe `SessionReporter` reutilisable:
```js
const { SessionReporter } = require('./cli/session-reporter');
const reporter = new SessionReporter({ name: 'My Session', url: 'ws://localhost:3001' });
reporter.connect();
reporter.updateTask('Refactoring auth module');
reporter.logAction('Modified auth.js');
```

## Fichiers
- `cli/session-reporter.js` — **nouveau fichier**

## Verification
```bash
# 1. Demarrer le serveur
cd backend && npm run dev

# 2. Dans un autre terminal, lancer le reporter
node cli/session-reporter.js --name "Test Session"

# 3. Taper des commandes
task Working on authentication
action Modified auth.js
status idle

# 4. Verifier dans le dashboard ou via API
curl http://localhost:3001/api/sessions
```

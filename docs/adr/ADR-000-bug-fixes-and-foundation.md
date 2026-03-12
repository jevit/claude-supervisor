# ADR-000: Bug Fixes & Foundation

## Statut
Accepte - 2026-03-12

## Contexte
Le projet claude-supervisor est a ~25-30% de completion avec plusieurs bugs bloquants qui empechent le serveur de demarrer et le dashboard de fonctionner. Avant d'ajouter de nouvelles fonctionnalites, il faut corriger ces problemes fondamentaux.

## Problemes identifies

### 1. Import crypto casse dans agents.js
- **Bug**: `const { v4: uuidv4 } = require('crypto')` — `v4` n'existe pas dans le module `crypto` natif de Node.js (c'est une API du package `uuid`)
- **Impact**: Crash a la creation d'un agent

### 2. Import crypto manquant dans tasks.js
- **Bug**: `crypto.randomUUID()` utilise sans import
- **Impact**: Crash a la creation d'une tache

### 3. Endpoint /api/sessions manquant
- **Bug**: `Dashboard.jsx` appelle `fetch('/api/sessions/recap')` mais aucune route n'existe
- **Impact**: Le dashboard ne peut pas charger les donnees de session

### 4. TerminalTracker non instancie
- **Bug**: La classe existe mais n'est jamais instanciee dans `index.js`
- **Impact**: Aucun tracking de session possible

### 5. settings.json non charge
- **Bug**: Le fichier `.claude/settings.json` existe mais n'est pas lu par le backend
- **Impact**: Configuration du projet ignoree

### 6. Anthropic SDK requis au demarrage
- **Bug**: `new Anthropic()` dans le constructeur de `AgentSupervisor` crash si pas de cle API
- **Impact**: Impossible de demarrer le serveur sans `ANTHROPIC_API_KEY`

## Decisions

### Fix 1-2: Utiliser `crypto.randomUUID()` avec import correct
```js
const crypto = require('crypto');
// puis: crypto.randomUUID()
```
Node.js >= 19 supporte `crypto.randomUUID()` nativement. Pas besoin du package `uuid`.

### Fix 3-4: Creer routes/sessions.js + instancier TerminalTracker
Nouveaux endpoints:
- `GET /api/sessions` — liste toutes les sessions
- `GET /api/sessions/recap` — recap consolide
- `POST /api/sessions` — enregistrer une session
- `PUT /api/sessions/:id` — mettre a jour une session
- `DELETE /api/sessions/:id` — supprimer une session

TerminalTracker instancie dans `index.js` et expose via `app.locals.tracker`.

### Fix 5: Charger settings.json au demarrage
Lecture de `.claude/settings.json` au boot, expose via:
- `app.locals.settings`
- `GET /api/settings`

### Fix 6: Rendre Anthropic SDK optionnel
```js
let Anthropic;
try { Anthropic = require('@anthropic-ai/sdk'); } catch {}
```
- Le serveur demarre sans cle API
- `assignTask()` retourne une erreur claire si le client n'est pas disponible
- Message informatif au demarrage: "Mode sans API Anthropic"

## Autres ameliorations
- `GET /api/health` enrichi avec nombre de sessions et agents
- Envoi de l'etat initial (`init` event) aux nouveaux clients WebSocket
- Le WebSocket envoie le recap + agents a la connexion

## Fichiers modifies
- `backend/src/routes/agents.js` — fix import crypto
- `backend/src/routes/tasks.js` — ajout import crypto
- `backend/src/services/supervisor.js` — SDK optionnel
- `backend/src/index.js` — TerminalTracker, sessions routes, settings, health enrichi
- `backend/src/routes/sessions.js` — **nouveau fichier**

## Verification
```bash
# Le serveur demarre sans cle API
cd backend && npm start

# Health check
curl http://localhost:3001/api/health

# Recap (vide mais fonctionnel)
curl http://localhost:3001/api/sessions/recap

# Settings
curl http://localhost:3001/api/settings
```

# ADR-008: Health Checks

## Statut
Accepte - 2026-03-12

## Contexte
Quand plusieurs sessions travaillent en parallele, une regression (build casse, tests echoues) peut se propager. Un service de health check periodique permet de detecter les problemes rapidement.

## Decision
Service `HealthChecker` qui execute des commandes de verification periodiques (build, tests, lint) et enregistre les resultats.

## Implementation

### Service `HealthChecker`
- Checks configurables: `{ name, command, interval, timeout }`
- Execution periodique selon l'intervalle
- Resultats: `{ name, status: 'pass'|'fail', output, duration, timestamp }`
- Broadcast `health:pass` ou `health:fail` apres chaque check
- Persiste le dernier resultat de chaque check dans le JsonStore (cle `healthChecks`)

### Checks par defaut
Aucun check par defaut — tout est configure via l'API ou settings.json.

### API REST
- `GET /api/health-checks` — derniers resultats de tous les checks
- `POST /api/health-checks` — ajouter un check
- `POST /api/health-checks/:name/run` — lancer un check manuellement
- `DELETE /api/health-checks/:name` — supprimer un check

## Fichiers
- `backend/src/services/health-checker.js` — **nouveau**
- `backend/src/routes/health-checks.js` — **nouveau**
- `backend/src/index.js` — integration

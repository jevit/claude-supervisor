# Roadmap

## Phase 1 - MVP
- [x] Structure du projet
- [x] Backend API REST + WebSocket
- [x] Frontend dashboard avec recap global
- [x] Tracking des sessions
- [x] Agent de recherche d'irritants
- [x] Integration reelle avec les terminaux Claude Code (MCP Server)
- [x] Persistance des donnees (fichier JSON avec debounce)

## Phase 2 - Coordination
- [x] Systeme de locks de fichiers entre sessions
- [x] Detection de conflits potentiels (fichier, repertoire, doublons)
- [x] Bus de messages inter-sessions
- [x] Notifications intelligentes (toast + son)

## Phase 3 - Intelligence
- [x] Contexte partage entre sessions
- [x] Suggestions de repartition des taches (mode superviseur)
- [x] Detection automatique de doublons de travail
- [x] Health check continu du projet
- [x] UI recherche d'irritants
- [x] Regles d'alertes configurables

## Phase 4 - Orchestration
- [x] Orchestration des commits git (file d'attente)
- [x] Propagation automatique des changements d'environnement (EnvWatcher)
- [x] Mode "superviseur" avec delegation automatique de sous-taches
- [x] Historique et analytics des sessions (graphiques)

## Phase 5 - Qualite
- [x] Tests unitaires (JsonStore, TerminalTracker, MessageBus, ConflictDetector, NotificationManager)
- [ ] Tests E2E automatises
- [ ] CI/CD pipeline

# Fonctionnalites - Claude Supervisor

Document exhaustif de toutes les fonctionnalites attendues, derivees du but du projet
et des irritants identifies.

---

## 1. Supervision Multi-Terminal en Temps Reel

> Irritant adresse: **Manque de visibilite** (5/5), **Surcharge cognitive** (5/5)

### 1.1 Tracking des sessions
- Enregistrement automatique de chaque session Claude Code active
- Suivi de l'etat de chaque terminal: actif, en attente, en erreur
- Capture de la tache en cours dans chaque session
- Capture de l'etat de reflexion (ce que Claude "pense")
- Historique des 50 dernieres actions par session
- Horodatage de chaque mise a jour

### 1.2 Dashboard recap global
- Vue d'ensemble en une seule page de toutes les sessions
- Compteurs en temps reel: total, actives, en attente, en erreur
- Carte individuelle par session avec:
  - Nom et repertoire de travail
  - Tache en cours
  - Etat de reflexion
  - 5 dernieres actions
  - Badge de statut colore
- Rafraichissement automatique via WebSocket (pas de polling)

### 1.3 Timeline unifiee
- Chronologie globale de toutes les actions de toutes les sessions
- Filtrage par session, par type d'action, par periode
- Vue condensee des evenements importants

---

## 2. Coordination Inter-Sessions

> Irritant adresse: **Coordination** (4/5), **Conflits Git** (4/5)

### 2.1 Systeme de locks de fichiers
- Detection des fichiers en cours de modification par chaque session
- Verrouillage souple (avertissement) ou strict (blocage) configurable
- Liste des fichiers lockes visible dans le dashboard
- Liberation automatique quand la session termine son edition

### 2.2 Detection de conflits
- Alerte quand deux sessions touchent le meme fichier
- Alerte quand deux sessions travaillent dans le meme repertoire
- Visualisation des zones de chevauchement dans le dashboard
- Suggestions de resolution (attendre, merger, reassigner)

### 2.3 Orchestration des commits Git
- File d'attente de commits pour eviter les merge conflicts
- Sequencement intelligent des commits paralleles
- Detection precoce de conflits avant le commit
- Recap des branches actives par session

---

## 3. Communication Inter-Sessions

> Irritant adresse: **Communication** (4/5), **Perte de contexte** (5/5)

### 3.1 Bus de messages
- Canal de communication entre les sessions Claude
- Messages automatiques (alertes systeme) et manuels (utilisateur)
- Types de messages: info, warning, error, request
- File de messages par session avec accusé de reception

### 3.2 Contexte partage
- Fichier de contexte global accessible a toutes les sessions
- Mise a jour en temps reel quand une session ajoute du contexte
- Resume automatique du contexte pour les nouvelles sessions
- Historique du contexte partage

### 3.3 Alertes intelligentes
- Notifications push vers le dashboard (toast + son)
- Alertes configurables par severite et par type
- Resume des alertes non lues au retour sur le dashboard
- Regles d'alerte personnalisables

---

## 4. Sante du Projet

> Irritant adresse: **Propagation d'erreurs** (4/5), **Gestion d'etat** (3/5)

### 4.1 Health check continu
- Verification periodique que le build est fonctionnel
- Execution automatique des tests critiques
- Alerte globale immediate en cas de regression
- Historique de sante avec graphique d'evolution

### 4.2 Detection des changements d'environnement
- Surveillance des fichiers de config (package.json, .env, etc.)
- Alerte quand une session installe/supprime un package
- Alerte quand la config change (variables d'env, ports, etc.)
- Propagation automatique des changements aux autres sessions

### 4.3 Detection de doublons de travail
- Analyse semantique des taches en cours dans chaque session
- Alerte quand deux sessions semblent faire la meme chose
- Suggestion de fusion ou reassignation

---

## 5. Systeme d'Agents Specialises

### 5.1 Agent de recherche d'irritants
- Analyse automatique des patterns d'utilisation
- Identification des points de friction
- Scoring d'impact (1-5) par irritant
- Proposition de solutions pour chaque irritant
- 8 categories d'analyse: context_loss, coordination, visibility, conflict,
  cognitive_load, communication, state_management, error_propagation

### 5.2 Agent superviseur
- Orchestration de sous-taches entre sessions
- Delegation automatique basee sur la charge de chaque session
- Suivi de l'avancement global d'une tache distribuee
- Rapport de completion avec resultats agreges

### 5.3 Agents futurs (extensible)
- Architecture plugin pour ajouter de nouveaux agents
- Chaque agent a: nom, role, prompt systeme, statut, historique
- Les agents communiquent via le bus de messages
- Dashboard de gestion des agents (creation, suppression, monitoring)

---

## 6. Interface Dashboard

### 6.1 Pages principales
- **Dashboard**: recap global + cartes sessions + timeline
- **Agents**: gestion des agents specialises
- **Conflits**: vue des locks et conflits en cours
- **Historique**: timeline complete et analytics

### 6.2 Design
- Theme sombre optimise pour le travail prolonge
- Sidebar de navigation fixe
- Badges de statut colores (vert/gris/violet/rouge)
- Layout responsive
- Mise a jour temps reel sans rechargement

### 6.3 Notifications
- Toast notifications pour les evenements importants
- Notifications sonores configurables
- Centre de notifications avec historique
- Filtrage par type et severite

---

## 7. API et Integration

### 7.1 API REST
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | Etat du serveur |
| GET | `/api/agents` | Liste des agents |
| POST | `/api/agents` | Creer un agent |
| DELETE | `/api/agents/:id` | Supprimer un agent |
| GET | `/api/tasks` | Liste des taches |
| POST | `/api/tasks` | Assigner une tache |
| GET | `/api/sessions` | Liste des sessions |
| GET | `/api/sessions/recap` | Recap consolide |
| POST | `/api/sessions/:id/message` | Envoyer un message a une session |
| GET | `/api/locks` | Fichiers lockes |
| GET | `/api/health-check` | Sante du projet |

### 7.2 WebSocket (temps reel)
- Evenements session: registered, updated, removed
- Evenements taches: started, completed, failed
- Evenements agents: created, removed
- Evenements irritants: found, loaded
- Evenements conflits: detected, resolved
- Evenements sante: check_passed, check_failed

### 7.3 Integration Claude Code
- Connexion via le client Claude Code (compte web, pas de cle API)
- Hook dans les sessions terminales existantes
- Pas de dependance a l'API Anthropic directe

---

## 8. Configuration

### 8.1 Dossier .claude/
- `CLAUDE.md`: instructions projet pour les sessions Claude
- `settings.json`: parametres du superviseur (modeles, refresh, limites)

### 8.2 Parametres configurables
- Intervalle de rafraichissement du dashboard (defaut: 2s)
- Nombre max de sessions suivies
- Taille de l'historique par session (defaut: 50 actions)
- Severite minimale des alertes
- Mode de lock fichiers (souple/strict)

---

## Matrice Irritants → Fonctionnalites

| Irritant | Impact | Fonctionnalites qui le resolvent |
|----------|--------|----------------------------------|
| Manque de visibilite | 5/5 | Dashboard recap, Cartes sessions, Timeline |
| Surcharge cognitive | 5/5 | Recap auto, Alertes intelligentes, Timeline unifiee |
| Perte de contexte | 5/5 | Contexte partage, Resume auto, Bus messages |
| Coordination | 4/5 | Locks fichiers, Detection conflits |
| Conflits Git | 4/5 | Orchestration commits, Detection precoce |
| Communication | 4/5 | Bus messages, Alertes, Notifications |
| Propagation erreurs | 4/5 | Health check continu, Alerte globale |
| Gestion d'etat | 3/5 | Detection changements env, Propagation auto |

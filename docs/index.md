# Documentation — Claude Supervisor

---

## Guides d'utilisation

### [worktrees-guide.md](./worktrees-guide.md)
**Git Worktrees avec Claude Code.**
Comment isoler chaque agent sur sa propre branche. Méthode manuelle (PowerShell)
et méthode automatique (Squad Mode). Règles de décomposition des tâches, merge,
nettoyage. Référence des commandes `cs-wt-*`.

### [supervisor-guide.md](./supervisor-guide.md)
**Être un bon Supervisor.**
Les 4 niveaux d'utilisation (session unique → squad + MCP). Comment superviser
depuis le dashboard, intervenir sur un agent, coordonner avec des patterns
Producteur/Consommateur ou Parallèle. Checklists avant/après un squad.

### [terminals-guide.md](./terminals-guide.md)
**Terminaux dans l'application.**
Lancer un terminal depuis l'UI, vue simple vs vue grille (1×2, 2×1, 2×2, 2×3),
copier/coller, GitDiffPanel, troubleshooting node-pty.

### [getting-started.md](./getting-started.md)
**Démarrage rapide.**
Prérequis, installation, lancement backend + frontend. Référence des endpoints API.

---

## Référence technique

### [architecture.md](./architecture.md)
**Architecture technique.**
Schéma des composants (dashboard, backend, agents, terminaux), flux de données,
stack technique, configuration des ports.

### [features.md](./features.md)
**Fonctionnalités complètes.**
Document exhaustif de toutes les fonctionnalités, organisées en 8 sections.
Inclut la matrice irritants → fonctionnalités.

### [roadmap.md](./roadmap.md)
**Plan de développement en 4 phases.**
MVP → Coordination → Intelligence → Orchestration.

### [irritants.md](./irritants.md)
**Analyse des irritants utilisateur.**
Les 8 principaux points de friction identifiés pour le travail multi-terminal.

---

## Décisions d'architecture (ADR)

```
docs/adr/
├── ADR-000  Fondations du projet
├── ADR-001  Persistance JSON
├── ADR-002  Protocole WebSocket
├── ADR-003  CLI reporter
├── ADR-004  Dashboard améliorations
├── ADR-005  Timeline unifiée
├── ADR-006  File locking
├── ADR-007  Message bus
├── ADR-008  Health checks
├── ADR-009  Conflict detection
├── ADR-010  Shared context
├── ADR-011  Env watcher
└── ADR-012  Notifications
```

---

## Organisation des fichiers

```
docs/
├── index.md             ← Ce fichier (sommaire)
├── worktrees-guide.md   ← Guide worktrees + Claude
├── supervisor-guide.md  ← Guide supervision multi-agents
├── terminals-guide.md   ← Guide UI terminaux
├── getting-started.md   ← Démarrage rapide
├── architecture.md      ← Schéma technique
├── features.md          ← Toutes les fonctionnalités
├── roadmap.md           ← Plan de développement
├── irritants.md         ← Points de friction
└── adr/                 ← Architecture Decision Records
```

## Liens rapides

- Config Claude : [../.claude/CLAUDE.md](../.claude/CLAUDE.md)
- Config racine : [../CLAUDE.md](../CLAUDE.md)
- Settings : [../.claude/settings.json](../.claude/settings.json)
- Backend ENV : [../backend/.env.example](../backend/.env.example)

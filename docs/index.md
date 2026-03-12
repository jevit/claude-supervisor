# Documentation - Claude Supervisor

Index de tous les documents du projet.

---

## Documents disponibles

### [features.md](./features.md)
**Fonctionnalites completes du projet.**
Document exhaustif de toutes les fonctionnalites attendues, organisees en 8 sections:
supervision temps reel, coordination inter-sessions, communication, sante du projet,
agents specialises, interface dashboard, API/integration, et configuration.
Inclut la matrice irritants → fonctionnalites.

### [architecture.md](./architecture.md)
**Architecture technique.**
Schema des composants (dashboard, backend, agents, terminaux), flux de donnees,
stack technique et configuration des ports.

### [irritants.md](./irritants.md)
**Analyse des irritants utilisateur.**
Les 8 principaux points de friction identifies pour le travail multi-terminal
avec Claude Code. Chaque irritant est documente avec son impact (1-5),
sa description et la solution proposee. Inclut un tableau de priorisation.

### [roadmap.md](./roadmap.md)
**Plan de developpement en 4 phases.**
- Phase 1 (MVP): structure, API, dashboard, tracking, agent irritants
- Phase 2 (Coordination): locks, conflits, messages, notifications
- Phase 3 (Intelligence): contexte partage, suggestions, health check
- Phase 4 (Orchestration): commits, propagation env, mode superviseur

### [getting-started.md](./getting-started.md)
**Guide de demarrage rapide.**
Prerequis, installation, lancement et reference des endpoints API.

---

## Organisation

```
docs/
├── index.md          ← Ce fichier (sommaire)
├── features.md       ← Toutes les fonctionnalites
├── architecture.md   ← Schema technique
├── irritants.md      ← Points de friction identifies
├── roadmap.md        ← Plan de developpement
└── getting-started.md ← Guide de demarrage
```

## Liens utiles

- Config Claude: [../.claude/CLAUDE.md](../.claude/CLAUDE.md)
- Settings: [../.claude/settings.json](../.claude/settings.json)

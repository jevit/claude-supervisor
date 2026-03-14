# Guide — Git Worktrees avec Claude Code

## Pourquoi les worktrees ?

Sans worktrees, plusieurs instances Claude travaillant sur le même répertoire peuvent :
- Écraser les modifications des autres
- Créer des conflits git difficiles à résoudre
- Se bloquer mutuellement sur les mêmes fichiers

Avec les worktrees, chaque agent Claude obtient **sa propre copie de travail** sur une branche dédiée. Un seul dépôt `.git`, plusieurs répertoires isolés.

```
C:\Perso\Workspace3\
├── claude-supervisor\          ← master (ton travail)
└── cs-worktrees\               ← généré automatiquement
    ├── abc12345-agent-jwt\     ← Claude Agent 1
    ├── abc12345-agent-tests\   ← Claude Agent 2
    └── feature-analytics-kpi\ ← Claude manuel
```

---

## Installation et prérequis

```powershell
# Recharger le profil PowerShell (une fois)
. $PROFILE

# Vérifier que les alias sont disponibles
cs-wt-list
```

Le backend doit être démarré pour le mode Squad :
```powershell
cd C:\Perso\Workspace3\claude-supervisor\backend
npm run dev
```

---

## Méthode 1 — Worktrees manuels

### Créer un worktree

```powershell
# Syntaxe : cs-wt <nom-de-branche>
cs-wt feature/refactor-auth

# Ce qui se passe :
# 1. git worktree add C:\Perso\Workspace3\cs-worktrees\feature-refactor-auth -b feature/refactor-auth
# 2. cd vers ce répertoire automatiquement
```

### Lancer Claude dans le worktree

```powershell
# Tu es déjà dans le worktree après cs-wt
claude .

# Ou depuis n'importe où :
claude C:\Perso\Workspace3\cs-worktrees\feature-refactor-auth
```

### Prompt de démarrage recommandé

```
Tu travailles sur la branche feature/refactor-auth dans un worktree isolé.

Mission : Extraire la logique d'authentification de src/routes/sessions.js
vers un service dédié src/services/auth-service.js

Contraintes :
- Ne touche qu'aux fichiers dans src/services/ et src/routes/sessions.js
- Conserve l'API publique existante (pas de breaking change)
- Ajoute un commentaire JSDoc sur chaque fonction extraite
- Termine par un commit : "refactor: extraire auth-service"

Quand tu as terminé, dis "MISSION COMPLETE".
```

### Gérer plusieurs worktrees en parallèle

```powershell
# Terminal 1 — Claude sur feature A
cs-wt feature/auth-service
claude .

# Terminal 2 (nouveau PowerShell) — Claude sur feature B
cs-wt feature/analytics-kpi
claude .

# Terminal 3 (nouveau PowerShell) — toi sur master
cd C:\Perso\Workspace3\claude-supervisor
cs-wt-list   # voir l'état global
```

### Merger et nettoyer

```powershell
# Revenir sur master
cd C:\Perso\Workspace3\claude-supervisor

# Voir ce qu'a produit l'agent
git diff master..feature/auth-service

# Merger
git merge feature/auth-service --no-ff -m "merge: auth-service par agent Claude"

# Supprimer le worktree et la branche
cs-wt-rm feature/auth-service
```

---

## Méthode 2 — Squads automatiques (recommandé)

### Lancer un Squad avec worktrees

Dans l'UI → **Squad Mode** → remplir le formulaire :

```
Nom       : Refactor Auth
Objectif  : Découper auth.js en modules séparés avec tests
Répertoire: C:/Perso/MonProjet
Modèle    : Sonnet (par défaut)
☑ Worktrees isolés

Sous-tâches :
  jwt-agent    → "Extraire et implémenter jwt-service.js avec sign/verify/decode"
  middle-agent → "Extraire auth-middleware.js depuis sessions.js"
  test-agent   → "Écrire les tests unitaires pour jwt-service et auth-middleware"
```

**Ce qui se passe automatiquement :**
1. 3 branches créées : `squad/abc12345/jwt-agent`, `squad/abc12345/middle-agent`, `squad/abc12345/test-agent`
2. 3 worktrees dans `cs-worktrees/`
3. 3 terminaux Claude lancés, chacun dans son répertoire isolé
4. Contexte partagé mis à jour avec la mission et les membres

### Superviser depuis le dashboard

- **Vue Terminaux → Grille 2×2** : voir les 3 agents en même temps
- **SquadView** : progress par agent, broadcast de messages
- **Contexte Partagé** : si un agent découvre quelque chose d'utile, il le partage

### Broadcaster des instructions en cours de route

Depuis SquadView, le champ "Message à tous" :
```
Attention : ne pas modifier package.json, les dépendances sont gelées.
```

### Merger les résultats après le squad

```powershell
cd C:\Perso\Workspace3\claude-supervisor

# Voir toutes les branches de squad
git branch | Select-String "squad"

# Review agent par agent
git diff master..squad/abc12345/jwt-agent
git diff master..squad/abc12345/middle-agent
git diff master..squad/abc12345/test-agent

# Merger dans l'ordre logique
git merge squad/abc12345/jwt-agent    --no-ff -m "merge: jwt-service"
git merge squad/abc12345/middle-agent --no-ff -m "merge: auth-middleware"
git merge squad/abc12345/test-agent   --no-ff -m "merge: auth tests"
```

Puis dans l'UI : **Annuler le squad** ou **Supprimer** → les worktrees sont nettoyés automatiquement.

---

## Règles pour des tâches efficaces

### Décomposition correcte

Les tâches doivent être **indépendantes** : chaque agent ne touche qu'à un périmètre de fichiers sans intersection avec les autres.

| ❌ Mauvais (conflits garantis) | ✅ Bon (isolation réelle) |
|---|---|
| Agent 1 et 2 modifient tous les deux `auth.js` | Agent 1 → `jwt-service.js`, Agent 2 → `auth-middleware.js` |
| "Améliore le backend" | "Ajoute la pagination sur `GET /api/sessions`" |
| "Corrige les bugs" | "Fixe le bug de resize xterm (#issue-42)" |
| Tâche vague et large | Tâche précise avec fichiers cibles nommés |

### Template de prompt pour chaque agent

```
Tu es l'agent "[NOM]" dans un squad de [N] agents travaillant sur "[OBJECTIF GLOBAL]".

TA MISSION : [description précise, 1-3 phrases]

PÉRIMÈTRE (fichiers autorisés) :
- [fichier ou dossier 1]
- [fichier ou dossier 2]

FICHIERS INTERDITS (ne pas toucher) :
- package.json, package-lock.json
- .env, data/
- [autres fichiers des collègues]

DONE CRITERIA :
- [critère 1 vérifiable]
- [critère 2 vérifiable]

Quand tout est fait : commit avec message "feat: [description]" puis dis "MISSION COMPLETE".
```

---

## Contexte Partagé — Pré-charger avant un squad

Avant de lancer des agents, dépose les conventions importantes dans `/context` :

| Clé | Valeur exemple |
|-----|---------------|
| `convention-commits` | `feat:, fix:, chore:, refactor: — pas d'emojis` |
| `stack` | `Node 18, React 18, Express 4, pas de TypeScript` |
| `fichiers-interdits` | `data/, .env, package-lock.json — jamais modifier` |
| `convention-naming` | `camelCase JS, kebab-case fichiers, PascalCase composants` |
| `tests` | `Pas de mock — toujours tester contre le vrai backend` |

Les agents lisent ce contexte via le MCP (`supervisor_get_context`) et adaptent leur comportement.

---

## Référence des commandes PowerShell

```powershell
cs-wt <branche>      # Créer un worktree et s'y déplacer
cs-wt-list           # Lister tous les worktrees actifs
cs-wt-rm <branche>   # Supprimer worktree + branche locale
cs-wt-clean          # Pruner les worktrees obsolètes
cs-wt-dir            # Aller dans C:\Perso\Workspace3\cs-worktrees\
w3                   # Aller dans C:\Perso\Workspace3\
```

---

## Référence des commandes git utiles

```powershell
# Voir toutes les branches de squad
git branch | Select-String "squad"

# Diff d'une branche vs master
git diff master..<branche> -- [dossier optionnel]

# Log d'une branche depuis la divergence
git log master..<branche> --oneline

# Merger proprement
git merge <branche> --no-ff -m "merge: description"

# Supprimer toutes les branches squad terminées
git branch | Select-String "squad" | ForEach-Object { git branch -D $_.ToString().Trim() }

# Nettoyer les worktrees orphelins
git worktree prune
```

---

## Dépannage

**`cs-wt` échoue avec "already exists"**
```powershell
# La branche existe déjà — utiliser --track au lieu de -b
git worktree add C:\Perso\Workspace3\cs-worktrees\ma-branche ma-branche-existante
```

**Le worktree est là mais le dossier a été supprimé manuellement**
```powershell
cs-wt-clean   # ou : git worktree prune
```

**Conflit de merge après un squad**
```powershell
# Merger un agent à la fois, résoudre avant le suivant
git merge squad/abc/agent-1
# résoudre les conflits...
git add .
git commit
git merge squad/abc/agent-2
```

**node_modules manquant dans le worktree**
```powershell
# Les node_modules ne sont pas partagés entre worktrees
cd C:\Perso\Workspace3\cs-worktrees\ma-branche\backend
npm install
```

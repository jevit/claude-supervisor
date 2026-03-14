# Guide — Être un bon Supervisor Claude

## Le rôle du Supervisor

Le Supervisor, c'est toi. Claude Code est l'exécutant.
Ton rôle : **décomposer, déléguer, vérifier, merger**.

```
Supervisor (toi)
    │
    ├── Décompose la mission en tâches isolées
    ├── Lance les agents (squad ou manuel)
    ├── Surveille via le dashboard
    ├── Intervient si un agent est bloqué
    └── Valide et merge les résultats
```

---

## Les 4 niveaux d'utilisation

### Niveau 1 — Session unique

Un Claude, une tâche, dans ton répertoire courant.

```powershell
cd C:\Perso\MonProjet
claude .
```

**Quand l'utiliser :** tâche simple, pas de risque de conflit, tu veux superviser de près.

---

### Niveau 2 — Sessions parallèles avec worktrees

Plusieurs Claude en parallèle, chacun isolé sur sa branche.

```powershell
# Terminal 1 — Agent API
cs-wt feature/refactor-api
claude .

# Terminal 2 — Agent Tests
cs-wt feature/add-tests
claude .

# Terminal 3 — Toi, tu supervises et tu merges
cd C:\Perso\Workspace3\claude-supervisor
```

**Quand l'utiliser :** 2-3 tâches indépendantes, tu veux contrôler chaque session.

---

### Niveau 3 — Squad automatique

Le supervisor crée et coordonne tout via l'UI.

**Quand l'utiliser :** mission décomposable en 3-6 sous-tâches claires, tu veux superviser depuis le dashboard sans ouvrir de terminal toi-même.

---

### Niveau 4 — Squad + MCP + Contexte partagé

Les agents communiquent entre eux via le contexte partagé et les messages.

**Quand l'utiliser :** mission complexe où les agents ont besoin de se transmettre des informations (ex: Agent A produit une API que l'Agent B va consommer).

---

## Superviser depuis le dashboard

### Vue Terminaux — Grille 2×2 ou 2×3

La vue grille te permet de voir tous les agents actifs simultanément.

```
┌─────────────────────┬─────────────────────┐
│  [Squad] jwt-agent  │ [Squad] middle-agent │
│  > Analyzing...     │  > Writing tests...  │
│                     │                      │
├─────────────────────┼─────────────────────┤
│  [Squad] test-agent │  [Libre]             │
│  > npm test...      │       +              │
└─────────────────────┴─────────────────────┘
```

Active la grille : bouton **⊞ Grille** en haut à droite de la page Terminaux.

### Indicateurs à surveiller

| Signal | Signification | Action |
|--------|--------------|--------|
| Terminal figé depuis > 2 min | Agent bloqué ou en attente | Broadcaster une instruction |
| "MISSION COMPLETE" dans l'output | Agent terminé | Vérifier le commit, merger |
| Erreur rouge répétée | Bug ou contrainte non respectée | Injecter une correction |
| Progression à 0% après 5 min | Agent n'a pas démarré | Vérifier le worktree/répertoire |

---

## Intervenir sur un agent en cours

### Injecter une instruction depuis SessionCard

Depuis le Dashboard, chaque SessionCard a un bouton **⚡ (prompt injection)** :

```
Attention : tu utilises une API dépréciée.
Remplace toutes les occurrences de `jwt.sign(payload, secret)`
par `jwtService.sign(payload)` — le service est déjà importé.
```

### Broadcaster à tout un squad

Depuis SquadView → champ de message :

```
Stop. Ne modifie pas package.json.
Les dépendances sont gelées jusqu'au merge final.
Utilise uniquement ce qui est déjà installé.
```

### Mettre en pause / relancer

Depuis SessionCard : boutons **Pause** et **Resume** pour temporiser un agent sans le tuer.

---

## Patterns de coordination entre agents

### Pattern 1 — Producteur / Consommateur

Agent A produit une interface, Agent B l'implémente.

```
Contexte Partagé (à remplir avant le squad) :
  api-contract → "POST /api/auth/login → { token, expiresAt } | 400 { error }"

Agent A : "Implémenter l'endpoint selon api-contract dans le contexte partagé"
Agent B : "Consommer l'endpoint défini dans api-contract pour le frontend"
```

### Pattern 2 — Parallèle total

Agents totalement indépendants sur des périmètres disjoints.

```
Agent 1 → backend/src/services/jwt-service.js
Agent 2 → frontend/src/pages/Analytics.jsx
Agent 3 → docs/api-reference.md
```
Aucune coordination nécessaire, merge trivial.

### Pattern 3 — Séquentiel (Squad avec dépendances)

Pour l'instant, les dépendances entre agents ne sont pas automatiques.
Workaround : lancer les agents en 2 temps.

```
Étape 1 : Squad Agent A seul → attend "MISSION COMPLETE"
Étape 2 : Merger Agent A → lancer Agent B avec le résultat d'A
```

---

## Checklist avant de lancer un squad

```
[ ] La mission est décomposée en tâches avec fichiers cibles nommés
[ ] Les périmètres de fichiers ne se chevauchent pas
[ ] Le Contexte Partagé contient les conventions clés
[ ] Le répertoire de base est correct et accessible
[ ] Les node_modules sont installés (les worktrees ne les partagent pas)
[ ] Tu sais comment tu vas merger à la fin
```

---

## Checklist après un squad

```
[ ] Lire les commits de chaque branche (git log master..<branche>)
[ ] Vérifier le diff de chaque branche (git diff master..<branche>)
[ ] Merger dans l'ordre logique (dépendances d'abord)
[ ] Lancer les tests si existants
[ ] Annuler/supprimer le squad dans l'UI (nettoie les worktrees)
[ ] cs-wt-clean pour pruner les références obsolètes
```

---

## Erreurs fréquentes à éviter

| Erreur | Conséquence | Solution |
|--------|------------|----------|
| Tâches trop vagues | Claude part dans une mauvaise direction | Nommer les fichiers cibles explicitement |
| Tâches qui se chevauchent | Conflits de merge complexes | Vérifier que les périmètres sont disjoints |
| Pas de "done criteria" | L'agent ne sait pas quand s'arrêter | Ajouter des critères vérifiables dans le prompt |
| Oublier d'installer node_modules | Erreur au démarrage dans le worktree | `npm install` dans chaque worktree si besoin |
| Merger sans review | Code de mauvaise qualité en master | Toujours `git diff master..<branche>` avant |
| Squad sur des fichiers partagés | Conflits garantis | Pattern Parallèle total uniquement |

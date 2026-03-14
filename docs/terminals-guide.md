# Guide — Terminaux dans l'application

## Accéder aux terminaux

Dashboard → menu **Terminaux** (ou directement `http://localhost:3000/terminals`)

---

## Lancer un terminal Claude Code

### Formulaire de lancement (panneau gauche)

| Champ | Description | Exemple |
|-------|-------------|---------|
| **Répertoire** | Dossier de travail de Claude | `C:/Perso/MonProjet` |
| **Nom** | Label affiché dans la liste | `Agent API` |
| **Prompt initial** | Instruction envoyée au démarrage | `Analyse le fichier auth.js et liste les problèmes` |
| **Modèle** | Version Claude (optionnel) | Sonnet (recommandé) |
| **Mode dangereux** | Skip les confirmations de permissions | À éviter sauf besoin explicite |

Cliquer **Lancer Claude Code** → le terminal s'ouvre à droite.

---

## Vue simple (1 terminal)

Par défaut, un seul terminal est affiché à droite.

- **Cliquer** sur un terminal dans la liste → le basculer à droite
- **Double-cliquer** le nom dans la liste → renommer
- **×** rouge → arrêter le terminal
- **Nettoyer** → supprimer tous les terminaux arrêtés

---

## Vue Grille (plusieurs terminaux simultanément)

### Activer la grille

Bouton **⊞ Grille** en haut à droite.

### Choisir le layout

| Layout | Terminaux | Usage |
|--------|-----------|-------|
| `1×2` | 2 empilés verticalement | Comparer 2 agents |
| `2×1` | 2 côte à côte | Agents indépendants |
| `2×2` | 4 terminaux | Squad de 4 agents |
| `2×3` | 6 terminaux | Squad étendu |

### Ajouter un terminal dans la grille

**Cliquer** sur un terminal dans la liste de gauche → il apparaît dans la prochaine cellule libre.

Un **badge numéroté** `1`, `2`, `3`... indique sa position dans la grille.

Cliquer à nouveau → le retirer de la grille (toggle).

### Cellules vides

Affichent un `+` — cliquer un terminal dans la liste pour remplir la cellule.

### Fermer une cellule

Bouton `×` dans la barre de titre de chaque terminal dans la grille.

---

## Interagir avec un terminal

### Copier / Coller

| Action | Raccourci |
|--------|-----------|
| Copier une sélection | `Ctrl+C` (si texte sélectionné) ou `Ctrl+Shift+C` |
| Coller | `Ctrl+V` ou `Ctrl+Shift+V` |
| Coller | Clic droit |

### Voir le diff Git

Bouton **`±`** dans la barre de titre du terminal → ouvre le GitDiffPanel.

Le diff montre :
- Liste des fichiers modifiés (M / A / D / ?)
- Diff unifié avec numéros de ligne et couleurs
- Bouton refresh pour mettre à jour

Bouton **`>_`** → retour au terminal.

---

## Superviser plusieurs agents en vue grille

### Workflow recommandé

1. Lancer les terminaux via le formulaire (ou depuis un Squad)
2. Activer **⊞ Grille** → choisir **2×2**
3. Cliquer les 4 terminaux actifs dans la liste → ils remplissent la grille
4. Surveiller l'output en temps réel

### Lire l'output

- L'output se charge automatiquement à l'ouverture (dernières 10 000 lignes)
- Le flux temps réel arrive par WebSocket
- Scrollback : 5 000 lignes

### Reconnexion

Si le navigateur est rafraîchi, l'output existant est rechargé automatiquement.

---

## Connecter un terminal de l'application au supervisor MCP

Les terminaux lancés depuis l'UI utilisent `node-pty` — ils sont automatiquement trackés par le backend.

Si tu lances Claude Code **manuellement dans un autre terminal PowerShell**, le MCP (`.mcp.json`) connecte cette session au supervisor automatiquement au démarrage de Claude.

Tu peux vérifier la connexion dans la page **Contexte Partagé** ou **Dashboard** — la session apparaît dans la liste.

---

## Troubleshooting

**"node-pty non disponible" (badge rouge en haut)**
```powershell
cd C:\Perso\Workspace3\claude-supervisor\backend
npm rebuild node-pty
npm run dev
```

**Terminal lancé mais rien ne s'affiche**
- Vérifier que le répertoire existe et est accessible
- Vérifier la connexion WebSocket (bandeau `ConnectionBanner` en haut du dashboard)

**Le layout grille est trop petit pour lire**
- Passer en `1×2` ou `2×1` pour plus d'espace par terminal
- La font passe en 11px automatiquement sur les layouts denses (2×2, 2×3)

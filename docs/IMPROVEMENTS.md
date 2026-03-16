# Claude Supervisor — Backlog d'améliorations

> Audit multi-angle réalisé le 2026-03-15. 90 items identifiés.
> Angles couverts : UX/Ergonomie · Product Owner · Irritants techniques · Architecture · Tech Lead · Config & observabilité · Gestion des agents · Intégration terminal · Onboarding · Performance & stabilité.

## Légende
- 🔴 Critique / Irritant bloquant
- 🟠 Haute priorité
- 🟡 Moyenne priorité
- 🟢 Amélioration / Nice-to-have
- ⚡ Quick win (< 2h)
- 🏗️ Refacto structurelle

---

## 1. UX Terminal & Ergonomie

### 1. Pas de raccourci clavier pour créer un terminal
🟠 ⚡
**Problème :** Pour créer un terminal, l'utilisateur doit naviguer vers `/terminals`, puis trouver et cliquer le bouton "Nouveau terminal". Aucun raccourci global n'existe.
**Solution :** Ajouter `Alt+T` (ou `Ctrl+Shift+T` style VS Code) pour ouvrir la modal de création depuis n'importe quelle page. Le handler global dans `GlobalShortcuts` (App.jsx) peut être étendu.
**Fichiers :** `frontend/src/App.jsx`, `frontend/src/pages/Terminals.jsx`
**Effort :** S

### 2. Renommage par double-clic uniquement, affordance invisible
🟡 ⚡
**Problème :** Dans `TerminalView`, le nom du terminal n'est renommable que par double-clic. Aucun indice visuel ne signale cette fonctionnalité (pas de crayon, pas de tooltip visible sans survol).
**Solution :** Ajouter une icône ✏️ visible au survol du nom, et afficher "Double-clic pour renommer" dans un tooltip `title`. L'icon cliquable évite aussi la dépendance au double-clic, inaccessible sur mobile/tablette.
**Fichiers :** `frontend/src/pages/Terminals.jsx` (span `onDoubleClick`)
**Effort :** XS

### 3. Fermeture du terminal sans confirmation de perte de contexte
🔴 ⚡
**Problème :** Cliquer le bouton "✕ Fermer" dans `TerminalView` ferme immédiatement le terminal sans demander confirmation. Si Claude Code est en train d'exécuter une tâche longue, le processus est tué sans avertissement.
**Solution :** Si `terminalStatus === 'running'` et qu'il y a eu une activité récente (dernier output < 30s), afficher une confirmation `window.confirm` ou une modale custom avant de lancer le DELETE.
**Fichiers :** `frontend/src/pages/Terminals.jsx` (handler `onClose`)
**Effort :** XS

### 4. Absence de "copy to clipboard" sur les sorties terminal
🟡 ⚡
**Problème :** Dans `SquadView`, la sortie des agents est affichée dans une balise `<pre>` scrollable, mais il n'y a aucun bouton pour copier le contenu. L'utilisateur doit sélectionner manuellement.
**Solution :** Ajouter un bouton "📋 Copier" en overlay sur `member-terminal` qui appelle `navigator.clipboard.writeText(output)`. Le même pattern existe déjà dans `TerminalView` pour l'export.
**Fichiers :** `frontend/src/pages/SquadView.jsx` (composant `MemberPanel`)
**Effort :** XS

### 5. La grille de terminaux ne persiste pas la disposition entre sessions
🟡
**Problème :** Le layout choisi (1×2, 2×1, 2×2, 2×3) et la liste des terminaux ouverts dans la grille sont réinitialisés à chaque rechargement de page. L'utilisateur doit reconfigurer son espace de travail à chaque fois.
**Solution :** Persister le layout actif et les IDs des terminaux dans la grille via `localStorage`. Au montage de `Terminals`, restaurer l'état depuis `localStorage` si disponible.
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** S

### 6. Onglet Git Diff chargé en lazy mais sans indicateur de chargement
🟢 ⚡
**Problème :** Quand l'utilisateur clique l'onglet "⎇ Git Diff", un appel API est lancé mais le panneau reste vide pendant le chargement. Pas de skeleton, pas de spinner visible.
**Solution :** Dans `GitDiffPanel`, ajouter un état de chargement initial avec un skeleton (lignes grises animées en CSS) pendant le premier fetch, similaire au `loading-placeholder` déjà défini dans `index.css`.
**Fichiers :** `frontend/src/components/GitDiffPanel.jsx`
**Effort :** XS

### 7. Mode side-by-side du diff non mémorisé entre ouvertures
🟢 ⚡
**Problème :** La préférence "unified/side-by-side" et "flat/tree" dans `GitDiffPanel` est perdue à chaque fermeture du panneau.
**Solution :** Stocker ces préférences dans `localStorage` sous des clés `diff:view` et `diff:layout`. Les lire au montage avec une valeur par défaut.
**Fichiers :** `frontend/src/components/GitDiffPanel.jsx`
**Effort :** XS

### 8. Pas de feedback visuel quand le terminal attend une confirmation (y/N)
🟠
**Problème :** Le pattern `WAITING_PATTERNS` est défini dans `Terminals.jsx` mais ne semble pas utilisé pour déclencher un avertissement visuel dans la barre de titre du terminal. Un terminal bloqué sur "Allow? [y/n]" passe inaperçu en mode grille.
**Solution :** Parser le dernier output et, si `WAITING_PATTERNS` match, afficher un badge orange "⚠ Attend confirmation" dans le header du `TerminalView`. Déjà prévu par la constante, il manque juste l'affichage.
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** S

### 9. Barre de recherche xterm ne montre pas le total de résultats
🟡
**Problème :** La recherche Ctrl+F dans le terminal affiche un état booléen `found/not found` mais pas le compte de résultats (ex: "3 / 12"). L'addon `SearchAddon` de xterm supporte un callback avec l'index et le total.
**Solution :** Utiliser l'option `onDidChangeResults` de `SearchAddon` (disponible dans xterm 5.x avec `allowProposedApi: true`) pour mettre à jour `matchInfo` avec `{ current, total }`.
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** S

### 10. Auto-scroll bloqué ne se désactive pas automatiquement après scroll manuel
🟡
**Problème :** Quand l'utilisateur scrolle manuellement vers le haut dans un terminal, l'auto-scroll devrait se désactiver. Actuellement il faut cliquer le bouton toggle manuellement. xterm.js expose l'événement `onScroll`.
**Solution :** Écouter `xterm.onScroll` et si la position n'est pas au bas (`viewport.scrollTop + viewport.clientHeight < scrollHeight - 5`), désactiver automatiquement l'auto-scroll.
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** S

---

## 2. Gestion des agents & orchestration

### 11. Pas de vue d'ensemble "toutes sessions" unifiant terminaux PTY et sessions CLI
🔴
**Problème :** Les terminaux gérés par `TerminalManager` (PTY) et les sessions CLI enregistrées via `session-reporter.js` (`TerminalTracker`) coexistent mais sont affichés séparément. La page `/orchestrator` tente de les unifier mais sans visibilité croisée claire.
**Solution :** Créer une vue "Fleet" unifiée qui affiche dans une seule liste tous les processus actifs (PTY + CLI), avec leur type, statut git, durée, et activité récente. Un simple fusionnement des deux API calls `/api/terminals` + `/api/sessions` côté frontend suffit.
**Fichiers :** `frontend/src/pages/Orchestrator.jsx` (ou nouvelle page)
**Effort :** M

### 12. Pas de retry automatique pour un agent de squad en échec
🟠
**Problème :** Dans `SquadManager`, si un membre entre en status `error` ou `exited` prématurément, il reste en état terminal. Le squad continue (ou se bloque si c'était un prérequis) sans tentative de relance.
**Solution :** Ajouter une option `maxRetries` (défaut : 1) dans la config de squad. Dans `_syncAll()`, si un membre a `status === 'error'` et `retries < maxRetries`, respawner le terminal avec le même `_spawnConfig`.
**Fichiers :** `backend/src/services/squad-manager.js`
**Effort :** M

### 13. Absence de timeout global sur un squad
🟠
**Problème :** Un squad peut rester en état `running` indéfiniment si un agent boucle ou attend une confirmation. Il n'y a pas de timeout configurable pour forcer la complétion ou le passage en `partial`.
**Solution :** Ajouter un champ `timeoutMs` dans la config de squad. Dans `_syncAll()`, si `Date.now() - squad.createdAt > timeoutMs`, appeler `cancelSquad(squadId, 'timeout')`.
**Fichiers :** `backend/src/services/squad-manager.js`, `frontend/src/pages/SquadLauncher.jsx`
**Effort :** S

### 14. Le coordinateur de squad ne communique pas ses instructions aux workers via le dashboard
🟡
**Problème :** Quand un squad est lancé avec `autoCoordinate: true`, un coordinateur est spawné mais ses instructions restent opaques. Le dashboard affiche "🎼 Coordinateur" avec un statut mais pas les instructions envoyées aux workers.
**Solution :** Exposer les messages émis par le coordinateur (via `messageBus`) dans la `SquadView`, dans une section dédiée "Instructions du coordinateur".
**Fichiers :** `frontend/src/pages/SquadView.jsx`, `backend/src/routes/squads.js`
**Effort :** M

### 15. Pas de drag-and-drop pour réordonner les dépendances entre agents
🟡
**Problème :** Dans `SquadLauncher`, l'ordre des agents est figé à leur position dans le formulaire. Réordonner un agent implique de le supprimer et recréer.
**Solution :** Implémenter un drag-and-drop via l'API HTML5 native (`draggable`, `onDragStart`, `onDrop`) sur les blocs `.squad-task-block`. Recalculer les `dependsOn` après chaque déplacement.
**Fichiers :** `frontend/src/pages/SquadLauncher.jsx`
**Effort :** M

### 16. Progress des membres de squad non mis à jour en temps réel
🟡
**Problème :** Dans `MemberPanel` (SquadView), l'output est pollé toutes les 3s via `setInterval`. La barre de progression reste à 0 sauf si le terminal lui-même rapporte sa progression via MCP. Aucun parsing heuristique de l'output pour estimer la progression.
**Solution :** Passer sur un listener WS `terminal:output` dans la page `SquadView` pour recevoir l'output en push, et parser des patterns comme "Step 3/7" ou pourcentages dans l'output pour mettre à jour la progress bar automatiquement.
**Fichiers :** `frontend/src/pages/SquadView.jsx`
**Effort :** M

### 17. Impossible de mettre en pause un membre de squad individuel
🟢
**Problème :** Depuis `SquadView`, le seul contrôle disponible sur un membre est "✕ Stop" (kill définitif). Il n'est pas possible de suspendre temporairement un agent sans le tuer.
**Solution :** Ajouter un bouton "⏸ Pause" qui envoie `\x03` (Ctrl+C) ou un SIGSTOP au PTY via `POST /api/terminals/:id/write`. Afficher un badge "PAUSED" et un bouton "▶ Reprendre".
**Fichiers :** `frontend/src/pages/SquadView.jsx`, `backend/src/routes/terminals.js`
**Effort :** S

### 18. La détection de similarité de tâches est trop naïve
🟡
**Problème :** `ConflictDetector._taskSimilarity()` utilise une intersection de mots > 2 caractères avec un seuil de 0.5. Cela génère des faux positifs (deux tâches mentionnant "code" et "test") et rate des doublons sémantiques.
**Solution :** Améliorer avec une liste de stop-words (the, this, that, code, file, the, sur, le, la…) et normaliser les termes techniques (refactor/refactoring, test/tests). Un seuil de 0.65 avec stop-words serait plus précis.
**Fichiers :** `backend/src/services/conflict-detector.js`
**Effort :** S

---

## 3. Config & Templates

### 19. Le sélecteur de modèle ne liste que "Sonnet/Opus/Haiku" sans mapping vers les vrais IDs
🟠
**Problème :** Dans `SquadLauncher`, le `<select>` propose "Sonnet", "Opus", "Haiku" mais ces valeurs sont envoyées telles quelles au backend. `TerminalManager` les passe à `--model`. Si Claude Code n'accepte pas ces alias courts, l'argument est silencieusement ignoré.
**Solution :** Mapper vers les IDs officiels (ex: `claude-sonnet-4-5`, `claude-opus-4`, `claude-haiku-4`) dans le backend ou dans le select. Récupérer la liste depuis un endpoint `/api/settings/models` configurable.
**Fichiers :** `frontend/src/pages/SquadLauncher.jsx`, `frontend/src/pages/Terminals.jsx`, `backend/src/services/terminal-manager.js`
**Effort :** S

### 20. Pas de validation du répertoire de travail avant le lancement
🟠 ⚡
**Problème :** Dans `SquadLauncher` et dans la modal de création de terminal, le champ "Répertoire" est un input libre. Si le chemin n'existe pas, le PTY spawne dans le cwd du serveur sans avertissement.
**Solution :** Ajouter un endpoint `POST /api/terminals/validate-path` (appel à `fs.existsSync`) et valider le champ en blur. Afficher une erreur rouge si le path n'existe pas.
**Fichiers :** `backend/src/routes/terminals.js`, `frontend/src/pages/Terminals.jsx`, `frontend/src/pages/SquadLauncher.jsx`
**Effort :** S

### 21. Les templates de squad ne supportent pas le versionning
🟡
**Problème :** `SquadTemplates` stocke les templates sans historique. Si l'utilisateur modifie accidentellement un template (en sauvegardant par-dessus), l'ancienne version est perdue.
**Solution :** Stocker les templates avec un tableau `versions: [{ config, savedAt }]` (max 10 versions). Permettre la restauration depuis l'UI template avec un toggle "Historique".
**Fichiers :** `backend/src/services/squad-templates.js`, `frontend/src/pages/SquadLauncher.jsx`
**Effort :** M

### 22. Impossible d'importer/exporter les templates en JSON
🟡 ⚡
**Problème :** Les templates sont stockés uniquement dans `supervisor-data.json` local. Partager un template avec un collègue ou entre machines est impossible.
**Solution :** Ajouter des boutons "📤 Exporter" (télécharge un JSON) et "📥 Importer" (upload JSON) dans le `TemplatesPanel`. L'export est trivial (`JSON.stringify` + download). L'import valide le format avant d'appeler `POST /api/squad-templates`.
**Fichiers :** `frontend/src/pages/SquadLauncher.jsx`, `backend/src/routes/squad-templates.js`
**Effort :** S

### 23. Le contexte partagé n'a pas de champ de recherche/filtre
🟠 ⚡
**Problème :** Avec de nombreuses entrées dans `SharedContext`, retrouver une clé spécifique nécessite de scroller. Il n'y a aucun champ de recherche.
**Solution :** Ajouter un `<input placeholder="Filtrer par clé ou valeur...">` en haut de la liste. Filtrer `entries` côté client avec un simple `includes()` case-insensitive.
**Fichiers :** `frontend/src/pages/SharedContext.jsx`
**Effort :** XS

### 24. Pas d'édition inline des entrées de contexte partagé
🟠
**Problème :** Pour modifier la valeur d'une entrée existante dans `SharedContext`, il n'existe aucune action d'édition. L'utilisateur doit supprimer l'entrée et en recréer une, perdant l'historique.
**Solution :** Ajouter un bouton "✏️ Modifier" sur chaque `ContextEntry` qui fait passer la carte en mode édition inline (remplace `<p className="ctx-value">` par un `<textarea>` pré-rempli). Appeler `PUT /api/context/:key` à la validation.
**Fichiers :** `frontend/src/pages/SharedContext.jsx`, `backend/src/routes/context.js`
**Effort :** S

### 25. Le fichier settings.json n'est pas éditable depuis l'UI
🟡
**Problème :** Les paramètres (`backend/.claude/settings.json`) sont lus au démarrage du serveur mais ne sont modifiables qu'à la main. Il n'y a pas de page de configuration dans le dashboard.
**Solution :** Créer une page `/settings` avec des champs éditables pour les paramètres courants (port, modèle par défaut, timeout heartbeat, maxEvents). Appeler `PUT /api/settings` qui écrit le fichier et recharge les services concernés sans restart.
**Fichiers :** `backend/src/index.js`, nouveau `backend/src/routes/settings.js`, nouvelle `frontend/src/pages/Settings.jsx`
**Effort :** L

---

## 4. Observabilité & vision globale

### 26. La MiniTimeline ne montre que le type d'event, pas le contenu
🟠 ⚡
**Problème :** Dans `MiniTimeline`, chaque événement affiche uniquement le dernier segment du type (ex: "updated", "detected") sans context (quelle session ? quel fichier ?). Le champ `data` n'est pas affiché.
**Solution :** Afficher une ligne de détail compacte sous chaque event : pour `session:updated` → le nom de session, pour `conflict:detected` → le fichier, etc. Utiliser `evt.data.name || evt.data.sessionId || evt.source`.
**Fichiers :** `frontend/src/components/MiniTimeline.jsx`
**Effort :** XS

### 27. Pas d'alerte sonore ou notification browser quand un terminal attend une confirmation
🔴
**Problème :** Si un terminal est en mode grille (compact) et affiche "Allow? [y/n]", l'utilisateur ne le remarque pas facilement. Aucune notification système n'est déclenchée.
**Solution :** Dans `TerminalView`, détecter `WAITING_PATTERNS` dans l'output reçu par WS. Appeler `new Notification('Terminal attend confirmation', { body: terminalName })` si la permission est accordée. Ajouter un bouton "Autoriser les notifications" dans le header.
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** S

### 28. L'Analytics page recharge toute la data à chaque event WS
🟠 🏗️
**Problème :** Dans `Analytics.jsx`, `useWebSocket` appelle `fetchAll()` qui lance 5 requêtes HTTP parallèles à chaque event `session:*`, `squad:*` ou `terminal:*`. Avec 10+ terminaux actifs, c'est du polling déguisé en temps réel.
**Solution :** Mettre en cache les données avec un debounce de 2s sur le refetch. Ou mieux : pousser les données calculées depuis le backend dans un event `stats:updated` WS toutes les 10s, et ne fetch qu'au montage initial.
**Fichiers :** `frontend/src/pages/Analytics.jsx`
**Effort :** M

### 29. Pas de vue "ligne du temps" des squads avec chronologie Gantt
🟡
**Problème :** L'Analytics montre la durée moyenne des squads mais pas une vue temporelle de quand chaque agent a démarré/terminé. Il est impossible de visualiser les dépendances respectées dans le temps.
**Solution :** Ajouter un mini-diagramme Gantt ASCII/SVG dans `SquadView` : une barre par membre, positionnée selon `startedAt` et `completedAt` relatifs au `createdAt` du squad. Conforme à la règle "pas de librairie externe".
**Fichiers :** `frontend/src/pages/SquadView.jsx`
**Effort :** M

### 30. Pas de compteur de tokens / coût estimé
🟡
**Problème :** Il n'y a aucune métrique de consommation de tokens ou d'estimation de coût dans Analytics. Pourtant, surveiller les coûts est critique pour un outil qui lance plusieurs instances Claude.
**Solution :** Si le hook `post-tool-reporter.js` reçoit les données de tokens depuis Claude Code (champ `tool_output` ou event `PostToolUse`), les accumuler par terminal dans `TerminalManager`. Exposer via `/api/terminals/:id/stats`. Afficher dans Analytics et dans le header de `TerminalView`.
**Fichiers :** `hooks/post-tool-reporter.js`, `backend/src/services/terminal-manager.js`, `frontend/src/pages/Analytics.jsx`
**Effort :** L

### 31. Le journal Timeline n'a pas de filtre par source (terminal ID)
🟡 ⚡
**Problème :** La page Timeline (non listée dans les fichiers audités, mais référencée dans `timelineRoutes`) permet de filtrer par type d'event mais pas par session/terminal source. Impossible d'isoler les events d'un agent spécifique.
**Solution :** Ajouter un filtre `source` dans la Timeline. Côté backend, `EventLog.getEvents()` supporte déjà `filters.source`. Côté frontend, ajouter un `<select>` des sources disponibles via un nouvel endpoint `/api/timeline/sources`.
**Fichiers :** `backend/src/services/event-log.js`, `backend/src/routes/timeline.js`
**Effort :** S

### 32. Sidebar : badge de conflit sans indication du type de sévérité
🟡 ⚡
**Problème :** Le badge rouge/orange dans la Sidebar indique le nombre de conflits mais pas leur nature. Un conflit de répertoire (warning) est visuellement identique à un conflit de fichier (error).
**Solution :** Afficher deux badges distincts si les deux types coexistent : un rouge pour `error` et un orange pour `warning`. Ou utiliser une icône différente (`⚠` vs `🔴`).
**Fichiers :** `frontend/src/components/Sidebar.jsx`
**Effort :** XS

### 33. Pas de page de détail pour un conflit
🟢
**Problème :** Dans `Conflicts.jsx`, les conflits sont listés avec une suggestion textuelle générique. Il n'y a pas de vue détaillée montrant les diffs côte-à-côte des fichiers en conflit.
**Solution :** Rendre chaque conflit de type `file` cliquable pour ouvrir un panneau `GitDiffPanel` côte-à-côte des deux sessions impliquées.
**Fichiers :** `frontend/src/pages/Conflicts.jsx`, `frontend/src/components/GitDiffPanel.jsx`
**Effort :** M

---

## 5. Intégration Claude Code

### 34. Le hook post-tool-reporter ne rapporte pas les erreurs d'outils
🔴 ⚡
**Problème :** `post-tool-reporter.js` envoie un heartbeat + résumé de l'action, mais ne distingue pas les succès des échecs. Un `Bash` qui retourne une erreur est traité identiquement à un succès.
**Solution :** Lire `hookData.tool_response?.is_error` ou un champ équivalent dans le JSON stdin. Si erreur, envoyer un event `action:error` au lieu du heartbeat, ce qui permettrait d'afficher les erreurs dans le dashboard.
**Fichiers :** `hooks/post-tool-reporter.js`, `backend/src/routes/sessions.js`
**Effort :** S

### 35. Le MCP n'expose pas de tool pour lire l'output du terminal courant
🟠
**Problème :** Un agent peut lire le contexte partagé (`supervisor_get_context`) et les sessions actives (`supervisor_get_sessions`), mais ne peut pas accéder à son propre buffer de sortie terminal via MCP. Cela limiterait les agents qui veulent analyser leur propre activité.
**Solution :** Ajouter un outil MCP `supervisor_get_own_output` qui appelle `GET /api/terminals/:SESSION_ID/output?last=1000` et retourne les dernières lignes. Utile pour les agents qui souhaitent analyser leur log récent.
**Fichiers :** `mcp/supervisor-mcp.js`
**Effort :** S

### 36. Le MCP ne supporte pas les notifications push vers l'agent
🟠
**Problème :** Les outils MCP sont tous en pull (l'agent appelle le supervisor). Si le supervisor veut interrompre un agent (nouveau conflit, message urgent), il n'y a pas de mécanisme push MCP.
**Solution :** Le protocole MCP supporte les "notifications" serveur → client. Implémenter un `server.notification()` pour envoyer des alertes en push quand un conflit est détecté impliquant la session courante.
**Fichiers :** `mcp/supervisor-mcp.js`
**Effort :** L

### 37. Le CLAUDECODE env var est supprimé mais le comportement "nested session" reste possible
🟡
**Problème :** Dans `terminal-manager.js`, `CLAUDECODE: undefined` est passé pour éviter l'erreur "nested session". Mais si Claude Code change de variable d'environnement de détection, ce workaround silencieux pourrait échouer sans log.
**Solution :** Ajouter un log explicite et vérifier que `CLAUDE_CODE_ENTRYPOINT` ou d'autres vars connues de détection imbriquée sont également unsetées. Documenter ce workaround dans un commentaire avec le lien vers l'issue.
**Fichiers :** `backend/src/services/terminal-manager.js`
**Effort :** XS

### 38. Pas de support du `pre-tool` hook pour bloquer des opérations dangereuses
🟡
**Problème :** Le hook `post-tool-reporter.js` est de type `PostToolUse` (après exécution). Il n'y a pas de hook `PreToolUse` qui permettrait de bloquer des opérations (ex: empêcher l'écriture dans un fichier verrouillé par une autre session).
**Solution :** Créer `hooks/pre-tool-guard.js` qui lit le lock du fichier cible via `GET /api/locks`, et retourne un exit code non-0 si le fichier est verrouillé par une autre session. Claude Code interprétera cela comme un blocage.
**Fichiers :** nouveau `hooks/pre-tool-guard.js`, `CLAUDE.md` (documentation)
**Effort :** M

### 39. Le session-reporter.js ne supporte pas la reconnexion automatique
🟠
**Problème :** Dans `session-reporter.js`, si la connexion WS est perdue, le script se termine. Il n'y a pas de logique de reconnexion avec backoff, contrairement au hook `useWebSocket` du frontend.
**Solution :** Implémenter une boucle de reconnexion avec backoff exponentiel (1s → 30s max) dans `SessionReporter`. Lors de la reconnexion, renvoyer un message `register` avec le même `sessionId` pour reprendre la session existante.
**Fichiers :** `cli/session-reporter.js`
**Effort :** S

---

## 6. Architecture & dette technique

### 40. `broadcast()` dans index.js est défini avant `conflictDetector` mais le référence
🔴 ⚡
**Problème :** Dans `backend/src/index.js`, la fonction `broadcast()` est définie lignes 75-94 et utilise `conflictDetector` déclaré ligne 102. C'est une référence à une variable `let` non encore initialisée. En JavaScript, cela fonctionne grâce à la fermeture (closure) mais crée un couplage temporel fragile.
**Solution :** Extraire `broadcast()` dans son propre module `services/broadcast.js` qui accepte `{ eventLog, conflictDetector }` en injection. `index.js` câble les dépendances après leur initialisation.
**Fichiers :** `backend/src/index.js`
**Effort :** M 🏗️

### 41. CSS inline dans chaque composant : pas de design system centralisé
🟠 🏗️
**Problème :** Chaque page/composant contient un bloc `<style>{`...`}</style>` avec ses propres classes CSS. Des patterns identiques sont redéfinis partout (`.card`, `.btn-primary`, `.status-badge`, `.session-tag`). Cela crée une divergence visuelle et un risque de régression lors de modifications.
**Solution :** Migrer vers des classes utilitaires définies dans `src/index.css` ou `design-system.css`. Supprimer les blocs `<style>` inline des composants. Unifier les composants atomiques (Badge, Button, Card) dans `src/components/ui/`.
**Fichiers :** Tous les fichiers `.jsx`, `frontend/src/index.css`, `frontend/src/design-system.css`
**Effort :** XL 🏗️

### 42. `setInterval` dans SquadLauncher non annulé si le composant est démonté rapidement
🟡 ⚡
**Problème :** Dans `SquadLauncher`, `const t = setInterval(fetchSquads, 5000)` avec `return () => clearInterval(t)` semble correct, mais en mode React StrictMode (double-mount), le premier interval peut survivre si le cleanup n'est pas exécuté correctement.
**Solution :** Vérifier que tous les `useEffect` avec `setInterval` ont bien leur cleanup function. Utiliser un pattern avec `useRef` pour l'interval ID pour garantir la stabilité.
**Fichiers :** `frontend/src/pages/SquadLauncher.jsx`, `frontend/src/pages/SquadView.jsx`
**Effort :** XS

### 43. `window.confirm` utilisé pour confirmer la suppression de namespace
🟡 ⚡
**Problème :** Dans `SharedContext.jsx`, `handleDeleteNamespace` utilise `window.confirm()`. Ce dialogue est bloquant, non personnalisable, et stylistiquement incohérent avec le thème Tokyonight.
**Solution :** Remplacer par une modale custom (composant `ConfirmModal`) réutilisable avec les couleurs du design system. La même modale servirait pour la suppression de terminaux, de squads, etc.
**Fichiers :** `frontend/src/pages/SharedContext.jsx`, nouveau `frontend/src/components/ConfirmModal.jsx`
**Effort :** S

### 44. Les requêtes fetch sans gestion d'erreur globale
🟠 🏗️
**Problème :** De nombreuses fonctions `fetch()` ont des `.catch(() => {})` vides ou `.catch(console.error)` qui avalent silencieusement les erreurs réseau. Un backend qui redémarre n'est pas signalé à l'utilisateur.
**Solution :** Créer un wrapper `apiFetch(url, options)` qui centralise la gestion d'erreurs : affiche un toast d'erreur via le `NotificationCenter` si le status HTTP est >= 400 ou si le réseau est inaccessible. Remplacer les `fetch()` directs par ce wrapper.
**Fichiers :** nouveau `frontend/src/services/api.js`, tous les fichiers `.jsx`
**Effort :** L 🏗️

### 45. `supervisor-data.json` grossit sans purge automatique
🔴
**Problème :** L'`EventLog` est limité à `maxEvents` mais les squads, terminaux et conflits terminés s'accumulent dans `supervisor-data.json` indéfiniment. La CLAUDE.md mentionne qu'il faut "purger périodiquement" mais c'est manuel.
**Solution :** Ajouter une tâche de purge planifiée dans `index.js` (ex: toutes les heures) qui supprime les terminaux `exited` depuis plus de 7 jours, les squads `completed/cancelled` depuis plus de 30 jours, et les conflits résolus. Ou exposer un endpoint `POST /api/admin/purge` avec un bouton dans l'UI.
**Fichiers :** `backend/src/index.js`, `backend/src/services/json-store.js`
**Effort :** S

### 46. Pas de tests automatisés
🔴 🏗️
**Problème :** La CLAUDE.md interdit les mocks ("toujours tester contre le vrai backend") mais aucun test n'est visible dans le projet. Sans tests, les refactors deviennent risqués.
**Solution :** Ajouter des tests d'intégration avec `node:test` (natif Node.js, pas de dépendance externe) qui démarrent le backend sur un port éphémère et testent les routes critiques (`/api/terminals`, `/api/squads`, `/api/context`). Exécuter avec `npm test` dans `/backend`.
**Fichiers :** nouveau `backend/test/`, `backend/package.json`
**Effort :** L

### 47. Le backend n'a pas de rate limiting sur les routes sensibles
🟠
**Problème :** Les routes `POST /api/terminals` (spawn un PTY) et `POST /api/squads` (lance N terminaux) n'ont aucun rate limiting. Un bug frontend ou une boucle accidentelle pourrait saturer les ressources système.
**Solution :** Ajouter `express-rate-limit` (ou une implémentation maison avec un `Map` timestamp → count) sur les routes de création. Limite suggérée : 10 créations/minute pour les terminaux, 5 pour les squads.
**Fichiers :** `backend/src/index.js`, `backend/src/routes/terminals.js`
**Effort :** S

### 48. Le WsProtocol utilise `ws.readyState === 1` en dur
🟢 ⚡
**Problème :** Dans `ws-protocol.js` ligne 284, `ws.readyState === 1` est une magic number. La constante `WebSocket.OPEN` (valeur 1) devrait être utilisée pour la lisibilité, mais `WebSocket` n'est pas importé dans ce fichier.
**Solution :** Importer `{ WebSocket }` depuis le package `ws` ou utiliser la constante locale `const OPEN = 1`. Même pattern pour les autres states (`CONNECTING = 0`, `CLOSING = 2`, `CLOSED = 3`).
**Fichiers :** `backend/src/services/ws-protocol.js`
**Effort :** XS

---

## 7. Performance & stabilité

### 49. Buffer terminal limité à 50k chars mais pas de gestion du replay sur grands buffers
🟠
**Problème :** `TerminalManager.maxBufferSize = 50000` mais lors du replay (`GET /api/terminals/:id/output?last=50000`), tout le buffer est envoyé en une seule réponse HTTP. Sur un terminal très actif, cela peut dépasser plusieurs MB de données ANSI.
**Solution :** Implémenter une pagination du buffer (ex: `?offset=0&limit=10000` en bytes). Le frontend ferait plusieurs appels séquentiels pour reconstruire l'état, ou utiliser un endpoint SSE (Server-Sent Events) pour streamer le replay.
**Fichiers :** `backend/src/services/terminal-manager.js`, `backend/src/routes/terminals.js`
**Effort :** M

### 50. Plusieurs composants créent une connexion WS indépendante
🔴 🏗️
**Problème :** `useWebSocket` crée une nouvelle connexion WebSocket par appel. `Conflicts.jsx`, `SquadLauncher.jsx`, `Analytics.jsx`, etc. appellent chacun `useWebSocket`. Sur une page avec plusieurs composants abonnés, chaque composant crée sa propre connexion WS vers le backend.
**Solution :** Implémenter un `WebSocketProvider` (Context React) qui maintient une seule connexion WS partagée et diffuse les messages aux abonnés via un `EventEmitter` ou un pattern `publish/subscribe`. `useWebSocket` devient un abonné à ce context.
**Fichiers :** `frontend/src/services/websocket.js`, `frontend/src/App.jsx`
**Effort :** M 🏗️

### 51. `setInterval` de polling dans Conflicts (5s) même quand la page est en arrière-plan
🟡
**Problème :** La page `Conflicts` maintient un `setInterval(fetchData, 5000)` même quand l'onglet navigateur est masqué. C'est du gaspillage réseau et CPU.
**Solution :** Utiliser `document.addEventListener('visibilitychange')` pour mettre en pause le polling quand `document.hidden === true` et le relancer à la reprise. Ce pattern est applicable à tous les composants avec `setInterval`.
**Fichiers :** `frontend/src/pages/Conflicts.jsx`, `frontend/src/pages/SquadLauncher.jsx`, `frontend/src/pages/SquadView.jsx`
**Effort :** S

### 52. Pas de limit sur le nombre de terminaux actifs simultanés
🟠
**Problème :** `TerminalManager` n'impose aucune limite sur le nombre de PTY actifs. Sur une machine avec 8GB RAM, spawner 20 instances Claude Code simultanément peut provoquer un OOM.
**Solution :** Ajouter un paramètre `maxTerminals` (défaut: 10, configurable via `.env` ou settings.json). Retourner HTTP 429 avec un message clair si la limite est atteinte.
**Fichiers :** `backend/src/services/terminal-manager.js`, `backend/src/routes/terminals.js`
**Effort :** XS

### 53. Le diff Git est recalculé à chaque ouverture du panneau sans cache
🟡
**Problème :** Dans `GitDiffPanel`, chaque ouverture du panneau déclenche un `git diff` via `GET /api/git/diff/:id`. Sur de grands repos, cette opération peut prendre 1-2s. Aucun cache n'est implémenté.
**Solution :** Dans `backend/src/routes/git.js`, mettre en cache le résultat du diff pendant 5s (avec invalidation sur `file:activity`). Stocker dans un `Map` `{ terminalId: { result, timestamp } }`.
**Fichiers :** `backend/src/routes/git.js`
**Effort :** S

### 54. L'event `terminal:output` est broadcasté à tous les clients dashboard
🟠
**Problème :** Dans `index.js`, `broadcast('terminal:output', ...)` envoie les données de sortie du terminal à **tous** les clients WS connectés, même ceux qui ne regardent pas ce terminal. Avec plusieurs terminaux actifs et plusieurs onglets du dashboard ouverts, le volume de données WS est multiplicatif.
**Solution :** Implémenter un système de subscription WS : le dashboard envoie `{ type: 'subscribe', terminalId }` et ne reçoit `terminal:output` que pour les terminaux souscrits. Le backend filtre dans `WsProtocol`.
**Fichiers :** `backend/src/services/ws-protocol.js`, `frontend/src/pages/Terminals.jsx`
**Effort :** M

### 55. Pas de gestion de la mémoire du processus backend
🟡
**Problème :** Le backend Node.js n'a pas de monitoring de sa propre consommation mémoire. Un leak dans un event listener ou l'accumulation de buffers peut faire crasher silencieusement le serveur.
**Solution :** Ajouter une route `GET /api/health/memory` qui retourne `process.memoryUsage()`. Afficher les métriques mémoire dans la page Analytics ou dans un indicateur de santé dans la Sidebar.
**Fichiers :** `backend/src/index.js`, `frontend/src/pages/Analytics.jsx`
**Effort :** XS

### 56. Le ResizeObserver dans TerminalView n'est pas nettoyé sur iOS/Safari
🟢
**Problème :** Dans `TerminalView`, le `ResizeObserver` est créé et `observe(containerRef.current)` est appelé. Si le navigateur ne supporte pas `disconnect()` proprement (ancien Safari), l'observer peut fuir.
**Solution :** Envelopper `resizeObserver.disconnect()` dans un try/catch dans le cleanup de `useEffect`. Déjà partiellement fait pour `fitAddon.dispose()`, appliquer le même pattern.
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** XS

---

## 8. Onboarding & découvrabilité

### 57. Pas de page d'accueil / first-run experience
🔴
**Problème :** Au premier lancement, l'application redirige directement vers `/terminals` qui affiche "Aucun terminal actif". Il n'y a aucun guide pour comprendre le concept, créer son premier terminal, ou configurer le MCP.
**Solution :** Détecter le "premier lancement" (0 terminaux ET 0 squads ET 0 sessions dans le store). Afficher une page d'accueil avec 3 étapes : (1) Créer un terminal, (2) Configurer le MCP dans `.mcp.json`, (3) Lancer un squad. Avec des boutons d'action directe.
**Fichiers :** `frontend/src/pages/Terminals.jsx`, `frontend/src/App.jsx`
**Effort :** M

### 58. La configuration du MCP n'est pas visible depuis le dashboard
🟠
**Problème :** Pour connecter Claude Code au superviseur via MCP, l'utilisateur doit manuellement créer `.mcp.json` à la racine de son projet. Cette information n'est disponible que dans les docs externes.
**Solution :** Ajouter une section "Configuration MCP" dans une page `/settings` ou dans un onboarding modal, avec le snippet JSON pré-rempli à copier (avec le bon chemin absolu vers `mcp/supervisor-mcp.js`).
**Fichiers :** nouvelle `frontend/src/pages/Settings.jsx`
**Effort :** S

### 59. L'icône `>_` dans la Sidebar pour "Terminaux" n'est pas immédiatement compréhensible
🟢 ⚡
**Problème :** Les icônes de navigation utilisent des symboles (`>_`, `⚠`, `📋`, `📊`, `👥`, `🎼`) qui ne sont pas universellement reconnus. En mode sidebar réduite, seules les icônes sont visibles.
**Solution :** Améliorer les icônes en mode collapsed avec des tooltips `title` déjà présents. Envisager des icônes SVG plus standards (terminal, warning, database, chart, group, conductor). Les emojis ont un rendu inconsistant selon les OS.
**Fichiers :** `frontend/src/components/Sidebar.jsx`
**Effort :** S

### 60. Pas de documentation contextuelle (info bulle) sur les features avancées
🟡
**Problème :** Des concepts comme "Worktrees isolés", "Contexte partagé injecté", ou "Dangerously skip permissions" n'ont aucune explication dans l'UI. L'utilisateur doit consulter la doc externe.
**Solution :** Ajouter des icônes ℹ️ à côté des labels avancés qui ouvrent un popover avec une explication de 2-3 lignes. Utiliser un composant `Tooltip` simple avec `title` enrichi ou un `<details><summary>` pour les formulaires.
**Fichiers :** `frontend/src/pages/SquadLauncher.jsx`, `frontend/src/pages/Terminals.jsx`
**Effort :** S

### 61. Pas de raccourci clavier documenté dans l'UI
🟡 ⚡
**Problème :** Les raccourcis `Alt+1` à `Alt+6` définis dans `App.jsx` (`GlobalShortcuts`) ne sont nulle part mentionnés dans l'interface. L'utilisateur ne peut pas les découvrir.
**Solution :** Ajouter un modal "?" (déclenché par `?` ou `F1`) qui liste tous les raccourcis disponibles. Ou afficher les raccourcis en sous-texte dans la Sidebar en mode expanded.
**Fichiers :** `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`
**Effort :** S

### 62. Le message d'erreur "node-pty non disponible" n'explique pas comment le corriger
🟠 ⚡
**Problème :** Si `node-pty` n'est pas compilé, le bouton "Nouveau Terminal" retourne une erreur HTTP 503. Le frontend affiche probablement une erreur générique sans indiquer `npm rebuild node-pty`.
**Solution :** Sur `GET /api/terminals/available` avec `{ available: false }`, afficher dans `Terminals.jsx` une bannière avec les instructions de correction : "node-pty non disponible → exécutez `npm rebuild node-pty` dans `backend/`".
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** XS

---

## 9. Analytics & métriques

### 63. La règle "pas de librairie de charts externe" est violée dans Analytics.jsx
🔴
**Problème :** `Analytics.jsx` importe `recharts` (`ResponsiveContainer`, `BarChart`, `PieChart`, etc.). Or la `CLAUDE.md` du frontend stipule explicitement "Pas de librairie de charts externe — barres ASCII pour l'instant". Il y a une contradiction entre la règle et l'implémentation.
**Solution :** Soit lever la règle en documentant le choix de `recharts` dans un ADR, soit migrer vers des charts SVG natifs. Un BarChart simple est réalisable en SVG pur en < 50 lignes. La `Sparkline` SVG dans `Terminals.jsx` en est déjà un exemple.
**Fichiers :** `frontend/src/pages/Analytics.jsx`, `frontend/CLAUDE.md`
**Effort :** L (migration) ou XS (mise à jour doc)

### 64. Les KPIs Analytics ne sont pas comparables dans le temps (pas de période)
🟡
**Problème :** Les métriques (sessions totales, durée moyenne des terminaux) sont des agrégats de toute l'historique. Il est impossible de voir "aujourd'hui vs hier" ou "cette semaine".
**Solution :** Ajouter un sélecteur de période (24h, 7j, 30j, tout) qui filtre les données avant calcul. Côté backend, ajouter un paramètre `?since=ISO_DATE` sur les endpoints `/api/sessions`, `/api/timeline`.
**Fichiers :** `frontend/src/pages/Analytics.jsx`, `backend/src/routes/timeline.js`
**Effort :** M

### 65. Pas de métrique sur les health checks : historique de disponibilité
🟡
**Problème :** La page Analytics affiche l'état actuel des health checks (OK/FAIL) mais pas leur historique. Un check qui flap entre OK et FAIL n'est pas visible.
**Solution :** Stocker l'historique des résultats de chaque health check (max 100 par check) dans `HealthChecker`. Exposer via `/api/health-checks/:id/history`. Afficher un mini-sparkline de disponibilité (similaire à Sparkline dans Terminals.jsx) dans la liste des checks.
**Fichiers :** `backend/src/services/health-checker.js`, `frontend/src/pages/Analytics.jsx`
**Effort :** M

### 66. Pas d'export des données analytics (CSV / JSON)
🟢
**Problème :** Il n'y a aucun moyen d'exporter les métriques pour un rapport externe ou une analyse dans un tableur.
**Solution :** Ajouter un bouton "📥 Exporter CSV" dans Analytics qui télécharge un CSV avec les données des tableaux (historique terminaux, historique squads). La génération côté frontend est triviale avec `Array.join(',')`.
**Fichiers :** `frontend/src/pages/Analytics.jsx`
**Effort :** S

### 67. Le graphique "Activité par heure" affiche les 24h glissantes sans indication du fuseau horaire
🟢 ⚡
**Problème :** Dans `Analytics.jsx`, `hourActivityData` utilise `new Date(ev.timestamp).getHours()` qui dépend du fuseau horaire local du navigateur. Si le backend tourne en UTC, les heures sont décalées.
**Solution :** Afficher le fuseau horaire dans le titre du graphique ("Activité par heure (heure locale)"). Ajouter une option pour basculer en UTC. Utiliser `Intl.DateTimeFormat` avec `timeZone: 'UTC'` si nécessaire.
**Fichiers :** `frontend/src/pages/Analytics.jsx`
**Effort :** XS

---

## 10. Sécurité & robustesse

### 68. Pas d'authentification sur le dashboard ni sur l'API
🔴
**Problème :** Le dashboard est accessible à `http://localhost:3000` sans aucune authentification. N'importe quel processus sur la machine (ou sur le réseau local) peut appeler les API, lancer des terminaux, ou lire le contexte partagé.
**Solution :** Implémenter une authentification minimale par token statique dans un header `X-Supervisor-Token` (configurable dans `settings.json`). Le frontend lit le token depuis `localStorage` et l'envoie dans chaque requête. Suffisant pour un outil local, sans l'overhead d'OAuth.
**Fichiers :** `backend/src/index.js`, `frontend/src/services/api.js`
**Effort :** M

### 69. Le `dangerousMode` (--dangerously-skip-permissions) sans confirmation explicite
🔴 ⚡
**Problème :** Dans la modal de création de terminal (`Terminals.jsx`), la case "Mode dangereux (skip permissions)" peut être cochée sans avertissement clair sur ses implications. Avec ce flag, Claude Code peut modifier/supprimer des fichiers système sans demander confirmation.
**Solution :** Afficher un avertissement rouge explicite quand la case est cochée, et demander une confirmation modale supplémentaire avant le spawn. Logger l'événement avec un niveau `warn` côté backend.
**Fichiers :** `frontend/src/pages/Terminals.jsx`, `backend/src/services/terminal-manager.js`
**Effort :** XS

### 70. Les clés du contexte partagé ne sont pas sanitizées
🟠
**Problème :** Dans `SharedContext`, une clé comme `../../../etc/passwd` ou une clé contenant `<script>` est acceptée sans validation. Si les clés sont utilisées dans des chemins de fichier ou affichées sans échappement, cela peut poser des problèmes.
**Solution :** Valider les clés côté backend (route `POST /api/context`) : regex `^[a-zA-Z0-9_/.-]+$` avec une longueur max de 128 caractères. Retourner HTTP 400 si la clé est invalide.
**Fichiers :** `backend/src/routes/context.js`
**Effort :** XS

### 71. Le CORS est en mode permissif (`app.use(cors())`)
🟠
**Problème :** Dans `index.js`, `app.use(cors())` sans configuration accepte les requêtes de n'importe quelle origine. Sur un réseau d'entreprise, cela permet à n'importe quel site web ouvert dans le navigateur de faire des requêtes au superviseur.
**Solution :** Configurer `cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] })` en production. Rendre la liste configurable via `settings.json`.
**Fichiers :** `backend/src/index.js`
**Effort :** XS

### 72. L'injection de prompt via `CLAUDE_INITIAL_PROMPT` sur Windows utilise `%VAR%`
🟠
**Problème :** Dans `terminal-manager.js` ligne 81, pour Windows : `claudeArgs.push('%CLAUDE_INITIAL_PROMPT%')`. Si l'argument est passé via `shellArgs = ['/k', claudeArgs.join(' ')]` à `cmd.exe`, l'expansion de `%VAR%` fonctionne, mais seulement si `cmd.exe` est invoqué avec `/c` et non `/k` (qui garde la session ouverte).
**Solution :** Tester rigoureusement sur Windows avec `/k` vs `/c`. Si le prompt est passé via l'env, la méthode `-c` de bash est plus fiable. Documenter le comportement attendu et ajouter un test d'intégration Windows.
**Fichiers :** `backend/src/services/terminal-manager.js`
**Effort :** S

### 73. Pas de validation des dépendances cycliques côté backend
🟡
**Problème :** `SquadLauncher.jsx` valide les dépendances cycliques côté frontend (`wouldCreateCycle()`), mais le backend `SquadManager.createSquad()` ne revalide pas. Un appel API direct avec un cycle dans `dependsOn` provoquerait un deadlock silencieux (agents qui attendent indéfiniment).
**Solution :** Porter la logique `wouldCreateCycle()` dans `SquadManager.createSquad()` et retourner une erreur 400 si un cycle est détecté.
**Fichiers :** `backend/src/services/squad-manager.js`
**Effort :** S

### 74. Le `stableId` dans `post-tool-reporter.js` utilise MD5
🟢 ⚡
**Problème :** `stableId()` utilise `crypto.createHash('md5')`. MD5 est déprécié pour les usages cryptographiques (même si ici c'est juste pour l'identification, pas pour la sécurité). La CLAUDE.md recommande `crypto.randomUUID()`.
**Solution :** Utiliser SHA-256 tronqué (`sha256(dir).substring(0, 12)`) pour un hash non cryptographiquement sensible mais plus moderne. Ou mieux, stocker le `SESSION_ID` généré dans un fichier `.supervisor-session` dans le répertoire projet.
**Fichiers :** `hooks/post-tool-reporter.js`
**Effort :** XS

---

## 11. Expérience multi-agents avancée

### 75. Pas de vue "carte réseau" des agents et leurs dépendances
🟡
**Problème :** Dans `SquadView`, les dépendances entre agents sont affichées textuellement ("En attente de : Agent 1"). Une visualisation graphique des dépendances (graphe orienté) aiderait à comprendre le flux d'exécution.
**Solution :** Implémenter un mini-graphe SVG qui affiche les agents comme des nœuds et les dépendances comme des flèches. SVG pur, sans librairie externe. Chaque nœud est coloré selon son status.
**Fichiers :** `frontend/src/pages/SquadView.jsx`
**Effort :** M

### 76. Le broadcast squad envoie à tous les agents, pas à des groupes cibles
🟡
**Problème :** Dans `SquadView`, le formulaire "📡 Tous les agents" envoie le message à TOUS les membres. Il n'est pas possible de broadcaster à un sous-groupe (ex: seulement les agents en status `waiting`).
**Solution :** Ajouter des checkboxes de sélection sur les agents. Le bouton "Envoyer" envoie uniquement aux sélectionnés. Exposer via `POST /api/squads/:id/broadcast` avec un paramètre `memberIds: string[]` optionnel.
**Fichiers :** `frontend/src/pages/SquadView.jsx`, `backend/src/routes/squads.js`
**Effort :** S

### 77. Pas de support de squads "rolling" (agents qui se relancent en boucle)
🟢
**Problème :** Le mode squad actuel est "one-shot" : chaque agent s'exécute une fois. Pour des usages de monitoring continu ou de scan périodique, il serait utile d'avoir des agents qui se relancent automatiquement.
**Solution :** Ajouter une option `mode: 'oneshot' | 'rolling'` dans la config squad. En mode `rolling`, quand un membre passe en `completed`, le rerespawner immédiatement avec le même prompt. Avec un délai `rollingDelayMs` configurable.
**Fichiers :** `backend/src/services/squad-manager.js`, `frontend/src/pages/SquadLauncher.jsx`
**Effort :** M

### 78. Pas de mécanisme de partage de résultats entre agents en fin de tâche
🟡
**Problème :** Quand un agent termine sa tâche, son output est dans un buffer terminal mais n'est pas automatiquement partagé avec les agents dépendants qui démarrent ensuite. Les agents qui démarrent après ne savent pas ce que leur prérequis a produit.
**Solution :** Quand un membre passe en `completed`, extraire les dernières N lignes de son output (strippées d'ANSI) et les stocker dans le SharedContext sous `squad:<squadId>/results/<memberName>`. Le prompt des membres dépendants pourrait référencer cette clé.
**Fichiers :** `backend/src/services/squad-manager.js`
**Effort :** M

### 79. Pas de visualisation du graphe de messages inter-sessions
🟢
**Problème :** Le `MessageBus` permet l'envoi de messages entre sessions, mais il n'y a pas de vue qui montre qui a envoyé quoi à qui. La page `/messages` (si elle existe) est opaque.
**Solution :** Créer une section dans Analytics ou une page dédiée qui affiche un fil de messages par session (style chat) avec `from`, `to`, `timestamp` et `preview`.
**Fichiers :** `frontend/src/pages/Analytics.jsx` ou nouvelle page `Messages.jsx`
**Effort :** M

### 80. Worktrees créés dans `../cs-worktrees` sans option de personnalisation depuis l'UI
🟡
**Problème :** `WORKTREES_DIR` est configurable via `.env` mais pas depuis le dashboard. Un utilisateur qui veut créer les worktrees dans un autre emplacement doit modifier un fichier d'environnement et redémarrer le backend.
**Solution :** Exposer `WORKTREES_DIR` dans la page `/settings` avec validation du chemin. Appeler `PUT /api/settings` pour mettre à jour la variable et la prendre en compte dans les prochains lancements de squad.
**Fichiers :** `backend/src/index.js`, `frontend/src/pages/Settings.jsx`
**Effort :** S

---

## 12. Intégration outils de développement

### 81. Pas de lien "Ouvrir dans VS Code" depuis le dashboard
🟡 ⚡
**Problème :** Chaque terminal/session affiche son `directory`. Il n'y a pas de bouton pour ouvrir ce répertoire dans VS Code ou un autre éditeur.
**Solution :** Ajouter un bouton "Ouvrir dans VS Code" (lien `vscode://file/<directory>`) dans `SessionCard` et dans `TerminalView`. Le schéma URI `vscode://` est supporté nativement par VS Code. Configurable pour d'autres éditeurs.
**Fichiers :** `frontend/src/components/SessionCard.jsx`, `frontend/src/pages/Terminals.jsx`
**Effort :** XS

### 82. Pas d'intégration avec `git log` pour voir l'historique des commits
🟡
**Problème :** `GitDiffPanel` montre les fichiers modifiés et le diff, mais pas l'historique des commits récents. Il est impossible de savoir si un agent a committé du code depuis le dashboard.
**Solution :** Ajouter un onglet "Log" dans `GitDiffPanel` qui appelle un nouveau endpoint `GET /api/git/log/:terminalId` (exécutant `git log --oneline -20 --pretty=format:"%h %s (%cr)"` dans le répertoire du terminal).
**Fichiers :** `frontend/src/components/GitDiffPanel.jsx`, `backend/src/routes/git.js`
**Effort :** S

### 83. Pas de support de l'API Claude Code `--resume` pour reprendre une conversation
🟢
**Problème :** Claude Code supporte `claude --resume <sessionId>` pour reprendre une conversation interrompue. Le `TerminalManager` n'expose pas cette option lors du spawn ou du resume d'un ghost terminal.
**Solution :** Ajouter un champ `resumeSessionId` dans les options de spawn. Passer `--resume <resumeSessionId>` aux `claudeArgs` si présent. Exposer dans l'UI comme option avancée lors du resume d'un ghost.
**Fichiers :** `backend/src/services/terminal-manager.js`, `frontend/src/pages/Terminals.jsx`
**Effort :** S

### 84. Pas de support des profils de terminal (style VS Code terminal profiles)
🟢
**Problème :** VS Code permet de définir des "profils" de terminal (shell, environnement, options). Claude Supervisor ne permet de configurer qu'un modèle et un répertoire. Des configurations fréquentes (ex: "Claude Opus avec MCP avancé dans /projet-X") ne peuvent pas être sauvegardées comme profil de terminal.
**Solution :** Permettre de sauvegarder une configuration de terminal (directory, model, dangerousMode, injectContext, prompt) comme "profil" dans settings.json. Accessible depuis un dropdown "Profils" dans la modal de création.
**Fichiers :** `frontend/src/pages/Terminals.jsx`, `backend/src/routes/terminals.js`
**Effort :** M

---

## 13. Robustesse et edge cases

### 85. Le ghost terminal ne nettoie pas son worktree git
🟠
**Problème :** Quand un terminal d'un squad avec worktrees se termine en `ghost` (interrompu), son worktree git n'est pas automatiquement supprimé. Les worktrees orphelins s'accumulent dans `cs-worktrees/`.
**Solution :** Dans `SquadManager`, quand un membre passe définitivement en `cancelled` ou est tué, appeler `worktreeManager.remove(worktreePath)`. Ajouter un endpoint `POST /api/admin/cleanup-worktrees` pour nettoyer les worktrees orphelins.
**Fichiers :** `backend/src/services/squad-manager.js`, `backend/src/services/worktree-manager.js`
**Effort :** S

### 86. La persistence des sessions ghost ne gère pas les terminaux tués brutalement (SIGKILL)
🟠
**Problème :** `terminalManager.persistState()` est appelé dans `gracefulShutdown()`. Si le backend est tué avec `SIGKILL` (pas de SIGTERM/SIGINT), les sessions courantes ne sont pas persistées et les ghost terminals de la session précédente sont perdus.
**Solution :** Persister l'état des terminaux à intervalles réguliers (ex: toutes les 30s dans le `_syncTimer` de `SquadManager`). Ou persister immédiatement à chaque changement d'état significatif (spawn, exit).
**Fichiers :** `backend/src/services/terminal-manager.js`, `backend/src/index.js`
**Effort :** S

### 87. `SquadManager._syncAll()` toutes les 5s sans debounce ni vérification d'état
🟡
**Problème :** `_syncTimer = setInterval(() => this._syncAll(), 5000)` appelle `listTerminals()` et met à jour le statut de chaque membre à chaque tick, même pour des squads déjà `completed`. Pour 20 squads terminés, c'est 20 × N membres × 5s = beaucoup de travail inutile.
**Solution :** Dans `_syncAll()`, sauter les squads non-`running`. Ou arrêter le timer si tous les squads sont dans un état terminal. Ajouter une condition `if (squad.status !== 'running') continue;`.
**Fichiers :** `backend/src/services/squad-manager.js`
**Effort :** XS

### 88. Le `EventLog.getEvents()` fait un reverse() mutatif sur une copie
🟢 ⚡
**Problème :** Dans `event-log.js`, `result.reverse()` est appelé sur `result = [...this.events]` qui est bien une copie. Cependant, la logique "ordre chronologique inverse" puis `.slice(0, limit)` est inefficace pour de grands journaux : on copie tout, on renverse tout, puis on tronque.
**Solution :** Utiliser `.slice(-limit).reverse()` sur le tableau original pour éviter de copier et renverser la totalité quand seule la fin est nécessaire : `this.events.slice(Math.max(0, this.events.length - limit)).reverse()`.
**Fichiers :** `backend/src/services/event-log.js`
**Effort :** XS

### 89. Le listener WS dans `Conflicts.jsx` pour `file:activity` a une fuite mémoire
🔴 ⚡
**Problème :** Dans `FilesOverview` (Conflicts.jsx lignes 23-29), un `window.addEventListener('ws:message', ...)` est ajouté dans un `useEffect`, mais le cleanup `return () => window.removeEventListener('ws:message', handler)` référence une `handler` différente (la variable `() => fetch$()` définie dans le corps du useEffect), pas celle passée à `addEventListener`. La suppression ne fonctionne donc pas.
**Solution :** Extraire le handler dans une variable stable :
```js
useEffect(() => {
  const handler = (e) => { if (e.detail?.event === 'file:activity') fetch$(); };
  window.addEventListener('ws:message', handler);
  return () => window.removeEventListener('ws:message', handler);
}, [fetch$]);
```
**Fichiers :** `frontend/src/pages/Conflicts.jsx` (composant `FilesOverview`)
**Effort :** XS

### 90. Pas de gestion du cas où `xterm.element` est null lors du fit
🟢 ⚡
**Problème :** Dans `TerminalView`, plusieurs `try { fitAddon.fit() } catch {}` avalent silencieusement les erreurs. Si `xterm.element` est null (terminal non encore monté dans le DOM), le fit échoue silencieusement et la taille reste à 120×40.
**Solution :** Ajouter une vérification explicite `if (xtermRef.current?.element && !destroyedRef.current)` avant chaque appel à `fitAddon.fit()` pour éviter les erreurs silencieuses et le comportement imprévisible.
**Fichiers :** `frontend/src/pages/Terminals.jsx`
**Effort :** XS

---

## Récapitulatif par priorité

| Priorité | Items |
|----------|-------|
| 🔴 Critique | 1, 27, 34, 40, 45, 46, 50, 57, 63, 68, 69, 89 |
| 🟠 Haute | 2, 3, 8, 11, 12, 13, 19, 20, 23, 24, 28, 38, 39, 44, 47, 52, 54, 58, 62, 70, 71, 72, 85, 86 |
| 🟡 Moyenne | 4, 5, 9, 10, 14, 16, 17, 18, 21, 25, 29, 30, 31, 32, 37, 42, 43, 51, 53, 55, 60, 61, 64, 65, 73, 75, 76, 78, 80, 82, 87 |
| 🟢 Nice-to-have | 6, 7, 15, 22, 26, 33, 36, 56, 59, 66, 67, 74, 77, 79, 81, 83, 84, 88, 90 |

## Récapitulatif par effort

| Effort | Items |
|--------|-------|
| XS (< 1j) | 2, 3, 6, 7, 26, 32, 37, 42, 43, 48, 52, 55, 56, 62, 67, 69, 70, 71, 74, 81, 87, 88, 89, 90 |
| S (1-3j) | 1, 4, 8, 9, 10, 13, 17, 18, 19, 20, 22, 23, 31, 39, 45, 47, 53, 58, 60, 61, 65, 66, 72, 73, 76, 80, 82, 83, 85, 86 |
| M (3-7j) | 11, 14, 15, 16, 21, 24, 28, 29, 33, 38, 43, 49, 50, 54, 57, 64, 68, 75, 77, 78, 79, 84 |
| L (> 7j) | 25, 30, 36, 41, 44, 46, 63 |
| XL | 41 |

---

*Audit réalisé après lecture complète du code source. Les items 🔴 marqués "Quick win ⚡" sont particulièrement à traiter en priorité car le ratio impact/effort est favorable.*

---
name: Patterns récurrents et anti-patterns détectés
description: Patterns de code récurrents bons et mauvais identifiés dans claude-supervisor
type: project
---

**Patterns établis (à maintenir) :**
- Tous les services prennent `(broadcast, store)` dans leur constructeur — injection de dépendances cohérente
- `_persist()` appelé après chaque mutation d'état dans les services
- `crypto.randomUUID()` partout pour les IDs (pas le package npm uuid)
- Gestion graceful shutdown : SIGINT/SIGTERM → destroy() sur tous les services
- Rate limiting sur le spawn des terminaux dans la route

**Anti-patterns identifiés (à corriger) :**
1. **Frontend n'utilise pas `apiFetch`** : La majorité des pages utilisent `fetch()` directement au lieu du wrapper `apiFetch` centralisé — incohérence avec le système d'auth token et la gestion d'erreur centralisée.
2. **Double risque de processHook dans le hook** : `post-tool-reporter.js` appelle `processHook` depuis `stdin.end` ET depuis un `setTimeout` — peut envoyer deux heartbeats.
3. **Rolling mode perd `_spawnConfig`** : Dans `squad-manager.js`, le mode rolling tente `m._spawnConfig` qui est `undefined` après le premier spawn (`delete member._spawnConfig` est appelé au spawn initial).
4. **Inline styles massifs** : Les composants React contiennent des centaines de lignes de CSS inline via template literals `<style>{}` — couplage fort, difficile à maintenir.
5. **Sidebar poll HTTP au lieu de WS** : La Sidebar poll `/api/conflicts` toutes les 10s alors que les events `conflict:*` arrivent déjà via WebSocket.

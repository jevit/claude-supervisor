/**
 * SharedContext - Contexte partagé entre toutes les sessions.
 *
 * Fonctionnalités :
 * - Namespaces : préfixe dans la clé séparé par "/" (ex: "conventions/commits")
 *   Les clés sans "/" appartiennent au namespace "général".
 * - Versioning : les 10 dernières valeurs de chaque clé sont conservées.
 *   Restauration possible via restore(key, versionIndex).
 */
class SharedContext {
  constructor(broadcast, store = null) {
    this.broadcast = broadcast;
    this.store = store;
    // Map key -> { key, namespace, value, author, updatedAt, history: [{value, author, updatedAt}] }
    this.entries = new Map();

    if (this.store) {
      const saved = this.store.get('sharedContext');
      if (saved && typeof saved === 'object') {
        for (const [key, entry] of Object.entries(saved)) {
          // Migration : ajouter namespace et history si absents
          this.entries.set(key, {
            history: [],
            ...entry,
            namespace: entry.namespace || this._getNamespace(key),
          });
        }
        console.log(`SharedContext: ${this.entries.size} entrée(s) restaurée(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    const serialized = {};
    for (const [key, entry] of this.entries) serialized[key] = entry;
    this.store.set('sharedContext', serialized);
  }

  /**
   * Extraire le namespace d'une clé (tout ce qui précède le premier "/").
   * "conventions/commits" → "conventions"
   * "stack"              → "général"
   */
  _getNamespace(key) {
    const idx = key.indexOf('/');
    return idx > 0 ? key.substring(0, idx) : 'général';
  }

  /**
   * Ajouter ou mettre à jour une entry.
   * L'ancienne valeur est poussée dans l'historique (max 10 versions).
   */
  add(key, value, author = 'system') {
    const existing = this.entries.get(key);
    const history  = existing
      ? [
          ...((existing.history || []).slice(-9)),
          { value: existing.value, author: existing.author, updatedAt: existing.updatedAt },
        ]
      : [];

    const entry = {
      key,
      namespace: this._getNamespace(key),
      value,
      author,
      updatedAt: new Date().toISOString(),
      history,
    };
    this.entries.set(key, entry);
    this._persist();
    this.broadcast('context:updated', { ...entry, historyCount: history.length });
    return entry;
  }

  /**
   * Restaurer une version antérieure (index dans history, 0 = plus ancienne).
   * Crée une nouvelle version "courante" avec l'ancienne valeur.
   */
  restore(key, versionIndex) {
    const entry = this.entries.get(key);
    if (!entry || !entry.history || entry.history.length === 0) return null;

    const version = entry.history[versionIndex];
    if (!version) return null;

    // La valeur actuelle va en historique, la version restaurée devient courante
    return this.add(key, version.value, `restored-by-dashboard`);
  }

  get(key) {
    return this.entries.get(key) || null;
  }

  getAll() {
    return Array.from(this.entries.values());
  }

  /**
   * Retourner les entries d'un namespace spécifique.
   */
  getByNamespace(namespace) {
    return this.getAll().filter((e) => e.namespace === namespace);
  }

  /**
   * Lister tous les namespaces avec leur nombre d'entrées.
   */
  getNamespaces() {
    const counts = {};
    for (const entry of this.entries.values()) {
      const ns = entry.namespace;
      counts[ns] = (counts[ns] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([namespace, count]) => ({ namespace, count }))
      .sort((a, b) => a.namespace.localeCompare(b.namespace));
  }

  remove(key) {
    if (!this.entries.has(key)) return false;
    this.entries.delete(key);
    this._persist();
    this.broadcast('context:removed', { key });
    return true;
  }

  /**
   * Résumé compact pour injection dans les prompts (sans l'historique).
   * Exclut les entrées internes des squads.
   */
  getSummary() {
    const entries = this.getAll().filter((e) => !e.key.startsWith('squad:'));
    if (entries.length === 0) return 'Aucun contexte partagé.';

    // Grouper par namespace
    const byNs = {};
    for (const e of entries) {
      if (!byNs[e.namespace]) byNs[e.namespace] = [];
      byNs[e.namespace].push(e);
    }

    return Object.entries(byNs)
      .map(([ns, list]) => {
        const lines = list.map((e) => `  - ${e.key}: ${e.value}`).join('\n');
        return ns === 'général' ? lines : `[${ns}]\n${lines}`;
      })
      .join('\n');
  }
}

module.exports = { SharedContext };

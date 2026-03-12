/**
 * SharedContext - Contexte partage entre toutes les sessions.
 *
 * Stocke des entries de contexte (cle/valeur) visibles par toutes les sessions.
 * Utile pour partager des decisions, conventions, ou decouvertes.
 */
class SharedContext {
  constructor(broadcast, store = null) {
    this.broadcast = broadcast;
    this.store = store;
    // Map key -> { key, value, author, updatedAt }
    this.entries = new Map();

    // Restaurer le contexte persiste
    if (this.store) {
      const saved = this.store.get('sharedContext');
      if (saved && typeof saved === 'object') {
        for (const [key, entry] of Object.entries(saved)) {
          this.entries.set(key, entry);
        }
        console.log(`SharedContext: ${this.entries.size} entree(s) restauree(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    const serialized = {};
    for (const [key, entry] of this.entries) {
      serialized[key] = entry;
    }
    this.store.set('sharedContext', serialized);
  }

  /**
   * Ajoute ou met a jour une entry de contexte.
   */
  add(key, value, author = 'system') {
    const entry = {
      key,
      value,
      author,
      updatedAt: new Date().toISOString(),
    };
    this.entries.set(key, entry);
    this._persist();
    this.broadcast('context:updated', entry);
    return entry;
  }

  /**
   * Recupere une entry par cle.
   */
  get(key) {
    return this.entries.get(key) || null;
  }

  /**
   * Retourne toutes les entries.
   */
  getAll() {
    return Array.from(this.entries.values());
  }

  /**
   * Supprime une entry.
   */
  remove(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this._persist();
    this.broadcast('context:removed', { key });
    return true;
  }

  /**
   * Retourne un resume compact du contexte (pour injection dans les prompts).
   */
  getSummary() {
    const entries = this.getAll();
    if (entries.length === 0) return 'Aucun contexte partage.';

    return entries
      .map((e) => `- ${e.key}: ${e.value}`)
      .join('\n');
  }
}

module.exports = { SharedContext };

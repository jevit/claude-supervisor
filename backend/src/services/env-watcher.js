const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * EnvWatcher - Surveillance des fichiers de configuration du projet.
 *
 * Detecte les modifications de fichiers critiques (package.json, .env, etc.)
 * et alerte les sessions via broadcast.
 */
class EnvWatcher {
  constructor(broadcast, store = null, options = {}) {
    this.broadcast = broadcast;
    this.store = store;
    this.debounceMs = options.debounceMs || 2000;

    // Map filePath -> { watcher, debounceTimer, lastHash }
    this.watches = new Map();
    // Historique des changements
    this.changes = [];
    this.maxChanges = options.maxChanges || 100;

    // Restaurer les fichiers surveilles et l'historique
    if (this.store) {
      const savedWatches = this.store.get('envWatches');
      if (savedWatches && Array.isArray(savedWatches)) {
        for (const filePath of savedWatches) {
          this.watch(filePath);
        }
        console.log(`EnvWatcher: ${savedWatches.length} fichier(s) surveille(s)`);
      }
      const savedChanges = this.store.get('envChanges');
      if (savedChanges && Array.isArray(savedChanges)) {
        this.changes = savedChanges;
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('envWatches', Array.from(this.watches.keys()));
    this.store.set('envChanges', this.changes);
  }

  /**
   * Calcule un hash rapide du contenu d'un fichier.
   */
  _hashFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch {
      return null;
    }
  }

  /**
   * Commence a surveiller un fichier.
   */
  watch(filePath) {
    const resolved = path.resolve(filePath);

    // Deja surveille
    if (this.watches.has(resolved)) return false;

    // Verifier que le fichier existe
    if (!fs.existsSync(resolved)) {
      console.warn(`EnvWatcher: fichier introuvable: ${resolved}`);
      // Surveiller quand meme (le fichier pourrait etre cree plus tard)
    }

    const watchEntry = {
      watcher: null,
      debounceTimer: null,
      lastHash: this._hashFile(resolved),
    };

    try {
      watchEntry.watcher = fs.watch(resolved, (eventType) => {
        if (eventType === 'change') {
          this._onFileChanged(resolved);
        }
      });

      watchEntry.watcher.on('error', () => {
        // Fichier supprime ou inaccessible
      });
    } catch {
      // fs.watch peut echouer si le fichier n'existe pas encore
    }

    this.watches.set(resolved, watchEntry);
    this._persist();
    return true;
  }

  /**
   * Callback appele quand un fichier change (avec debounce).
   */
  _onFileChanged(filePath) {
    const entry = this.watches.get(filePath);
    if (!entry) return;

    // Debounce
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(() => {
      entry.debounceTimer = null;

      const newHash = this._hashFile(filePath);
      if (newHash && newHash !== entry.lastHash) {
        entry.lastHash = newHash;

        const change = {
          id: crypto.randomUUID(),
          filePath,
          fileName: path.basename(filePath),
          timestamp: new Date().toISOString(),
        };

        this.changes.push(change);
        if (this.changes.length > this.maxChanges) {
          this.changes = this.changes.slice(-this.maxChanges);
        }

        this._persist();
        this.broadcast('env:changed', change);
        console.log(`EnvWatcher: changement detecte dans ${path.basename(filePath)}`);
      }
    }, this.debounceMs);
  }

  /**
   * Arrete la surveillance d'un fichier.
   */
  unwatch(filePath) {
    const resolved = path.resolve(filePath);
    const entry = this.watches.get(resolved);
    if (!entry) return false;

    if (entry.watcher) entry.watcher.close();
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    this.watches.delete(resolved);
    this._persist();
    return true;
  }

  /**
   * Retourne la liste des fichiers surveilles.
   */
  getWatches() {
    return Array.from(this.watches.keys()).map((filePath) => ({
      filePath,
      fileName: path.basename(filePath),
    }));
  }

  /**
   * Retourne l'historique des changements recents.
   */
  getChanges(limit = 50) {
    return [...this.changes].reverse().slice(0, limit);
  }

  /**
   * Arrete toutes les surveillances (shutdown).
   */
  destroy() {
    for (const entry of this.watches.values()) {
      if (entry.watcher) entry.watcher.close();
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    }
    this.watches.clear();
  }
}

module.exports = { EnvWatcher };

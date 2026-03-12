/**
 * FileLockManager - Systeme de verrous souples sur les fichiers.
 *
 * Permet aux sessions de declarer les fichiers qu'elles modifient.
 * Les locks sont souples: pas de blocage, mais detection de conflits.
 */
class FileLockManager {
  constructor(broadcast, store = null) {
    this.broadcast = broadcast;
    this.store = store;
    // Map filePath -> Set de sessionIds
    this.locks = new Map();

    // Restaurer les locks persistes
    if (this.store) {
      const saved = this.store.get('locks');
      if (saved && typeof saved === 'object') {
        for (const [filePath, holders] of Object.entries(saved)) {
          if (Array.isArray(holders) && holders.length > 0) {
            this.locks.set(filePath, new Set(holders));
          }
        }
        console.log(`FileLockManager: ${this.locks.size} lock(s) restaure(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    const serialized = {};
    for (const [filePath, holders] of this.locks) {
      serialized[filePath] = Array.from(holders);
    }
    this.store.set('locks', serialized);
  }

  /**
   * Prend un lock sur un fichier. Retourne les holders actuels.
   */
  acquire(filePath, sessionId) {
    if (!this.locks.has(filePath)) {
      this.locks.set(filePath, new Set());
    }

    const holders = this.locks.get(filePath);
    holders.add(sessionId);
    this._persist();

    const holdersArray = Array.from(holders);
    const isConflict = holdersArray.length > 1;

    if (isConflict) {
      this.broadcast('lock:conflict', {
        filePath,
        holders: holdersArray,
      });
    }

    this.broadcast('lock:acquired', {
      filePath,
      sessionId,
      holders: holdersArray,
    });

    return { acquired: true, holders: holdersArray, conflict: isConflict };
  }

  /**
   * Libere un lock sur un fichier.
   */
  release(filePath, sessionId) {
    const holders = this.locks.get(filePath);
    if (!holders) return false;

    holders.delete(sessionId);
    if (holders.size === 0) {
      this.locks.delete(filePath);
    }

    this._persist();
    this.broadcast('lock:released', { filePath, sessionId });
    return true;
  }

  /**
   * Libere tous les locks d'une session (deconnexion).
   */
  releaseAll(sessionId) {
    const released = [];
    for (const [filePath, holders] of this.locks) {
      if (holders.has(sessionId)) {
        holders.delete(sessionId);
        released.push(filePath);
        if (holders.size === 0) {
          this.locks.delete(filePath);
        }
      }
    }

    if (released.length > 0) {
      this._persist();
      this.broadcast('lock:released-all', { sessionId, files: released });
    }

    return released;
  }

  /**
   * Retourne tous les locks actifs.
   */
  getLocks() {
    const result = [];
    for (const [filePath, holders] of this.locks) {
      result.push({
        filePath,
        holders: Array.from(holders),
        conflict: holders.size > 1,
      });
    }
    return result;
  }

  /**
   * Retourne uniquement les fichiers en conflit (2+ holders).
   */
  getConflicts() {
    return this.getLocks().filter((l) => l.conflict);
  }
}

module.exports = { FileLockManager };

const { execFile } = require('child_process');
const crypto = require('crypto');

/**
 * GitOrchestrator - File d'attente de commits et detection de conflits Git.
 *
 * Gere une queue de commits pour eviter les merge conflicts entre sessions,
 * et fournit des informations sur les branches actives.
 */
class GitOrchestrator {
  constructor(broadcast, store = null) {
    this.broadcast = broadcast;
    this.store = store;
    // File d'attente de commits: [{ id, sessionId, directory, message, status, timestamp }]
    this.queue = [];
    this._processing = false;

    if (this.store) {
      const saved = this.store.get('gitQueue');
      if (saved && Array.isArray(saved)) {
        // Ne restaurer que les commits pending
        this.queue = saved.filter((c) => c.status === 'pending');
        if (this.queue.length > 0) {
          console.log(`GitOrchestrator: ${this.queue.length} commit(s) en attente`);
        }
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('gitQueue', this.queue);
  }

  /**
   * Ajoute un commit a la file d'attente.
   */
  enqueue(sessionId, directory, message) {
    const entry = {
      id: crypto.randomUUID(),
      sessionId,
      directory,
      message,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
    this.queue.push(entry);
    this._persist();
    this.broadcast('git:queued', entry);

    // Traiter la file si pas deja en cours
    this._processQueue();
    return entry;
  }

  /**
   * Traite la file d'attente de commits sequentiellement.
   */
  async _processQueue() {
    if (this._processing) return;
    this._processing = true;

    while (this.queue.some((c) => c.status === 'pending')) {
      const entry = this.queue.find((c) => c.status === 'pending');
      if (!entry) break;

      entry.status = 'processing';
      this._persist();
      this.broadcast('git:processing', entry);

      try {
        // Verifier s'il y a des conflits potentiels avant le commit
        const conflicts = await this._checkConflicts(entry.directory);
        if (conflicts.length > 0) {
          entry.status = 'conflict';
          entry.conflicts = conflicts;
          this._persist();
          this.broadcast('git:conflict', { ...entry, conflicts });
          continue;
        }

        // Le commit est pret a etre effectue par la session
        entry.status = 'ready';
        this._persist();
        this.broadcast('git:ready', entry);
      } catch (err) {
        entry.status = 'error';
        entry.error = err.message;
        this._persist();
        this.broadcast('git:error', entry);
      }
    }

    this._processing = false;
  }

  /**
   * Marque un commit comme complete (la session l'a execute).
   */
  complete(entryId) {
    const entry = this.queue.find((c) => c.id === entryId);
    if (!entry) return null;
    entry.status = 'completed';
    entry.completedAt = new Date().toISOString();
    this._persist();
    this.broadcast('git:completed', entry);

    // Nettoyer les anciens commits completes
    this.queue = this.queue.filter((c) =>
      c.status !== 'completed' || Date.now() - new Date(c.completedAt).getTime() < 3600000
    );
    this._persist();

    // Continuer a traiter la file
    this._processQueue();
    return entry;
  }

  /**
   * Annule un commit en attente.
   */
  cancel(entryId) {
    const idx = this.queue.findIndex((c) => c.id === entryId);
    if (idx === -1) return false;
    const entry = this.queue[idx];
    this.queue.splice(idx, 1);
    this._persist();
    this.broadcast('git:cancelled', entry);
    return true;
  }

  /**
   * Detecte les conflits potentiels (fichiers modifies non commites).
   */
  _checkConflicts(directory) {
    return new Promise((resolve) => {
      execFile('git', ['status', '--porcelain'], {
        cwd: directory,
        shell: true,
        timeout: 10000,
      }, (error, stdout) => {
        if (error) { resolve([]); return; }
        const conflicts = stdout.trim().split('\n')
          .filter((line) => line.trim())
          .map((line) => line.trim());
        resolve(conflicts);
      });
    });
  }

  /**
   * Recupere les branches actives dans un repertoire.
   */
  getBranches(directory) {
    return new Promise((resolve) => {
      execFile('git', ['branch', '--list', '-v'], {
        cwd: directory,
        shell: true,
        timeout: 10000,
      }, (error, stdout) => {
        if (error) { resolve([]); return; }
        const branches = stdout.trim().split('\n')
          .filter((line) => line.trim())
          .map((line) => {
            const current = line.startsWith('*');
            const parts = line.replace('*', '').trim().split(/\s+/);
            return { name: parts[0], commit: parts[1], current };
          });
        resolve(branches);
      });
    });
  }

  /**
   * Retourne l'etat de la file d'attente.
   */
  getQueue() {
    return [...this.queue];
  }
}

module.exports = { GitOrchestrator };

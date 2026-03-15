const crypto = require('crypto');

// Constantes hissées au niveau module — construites une seule fois
const SIMILARITY_STOP_WORDS = new Set([
  'the', 'this', 'that', 'with', 'from', 'for', 'and', 'but', 'not', 'are', 'was',
  'will', 'can', 'has', 'have', 'been', 'into', 'all', 'new', 'use', 'add', 'get',
  'les', 'des', 'une', 'dans', 'par', 'sur', 'pour', 'avec', 'est', 'qui',
  'que', 'ces', 'ses', 'son', 'mon', 'pas', 'plus', 'tout', 'bien',
  'code', 'file', 'files', 'test', 'tests', 'src', 'app', 'update', 'fix', 'bug',
]);
const SIMILARITY_SPLIT_RE = /[\s/.,;:!?()[\]{}'"]+/;
function _normalizeWord(w) { return w.replace(/s$/, '').replace(/ing$/, '').replace(/ed$/, ''); }
function _tokenize(task) {
  const words = task.toLowerCase().split(SIMILARITY_SPLIT_RE);
  return new Set(words.filter((w) => w.length > 2 && !SIMILARITY_STOP_WORDS.has(w)).map(_normalizeWord));
}

/**
 * ConflictDetector - Detection proactive de conflits entre sessions.
 *
 * Analyse les sessions actives et les locks pour detecter:
 * - Conflits de fichier (meme fichier modifie par 2+ sessions)
 * - Conflits de repertoire (meme cwd pour 2+ sessions)
 */
class ConflictDetector {
  constructor(tracker, lockManager, broadcast, store = null) {
    this.tracker = tracker;
    this.lockManager = lockManager;
    this.broadcast = broadcast;
    this.store = store;
    // Map conflictId -> conflict
    this.conflicts = new Map();
    // Cache des tokens par texte de tâche — évite de retokenizer les mêmes tasks à chaque analyze()
    this._tokenCache = new Map();

    // Restaurer les conflits persistes
    if (this.store) {
      const saved = this.store.get('conflicts');
      if (saved && Array.isArray(saved)) {
        for (const c of saved) {
          this.conflicts.set(c.id, c);
        }
        console.log(`ConflictDetector: ${saved.length} conflit(s) restaure(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('conflicts', Array.from(this.conflicts.values()));
  }

  /**
   * Analyse les sessions et locks pour detecter les conflits.
   * Appele apres chaque changement de session ou de lock.
   */
  analyze() {
    const previousIds = new Set(this.conflicts.keys());
    const currentConflicts = new Map();

    // 1. Conflits de fichier (depuis le lock manager)
    const fileLocks = this.lockManager.getConflicts();
    for (const lock of fileLocks) {
      const id = `file:${lock.filePath}`;
      currentConflicts.set(id, {
        id,
        type: 'file',
        severity: 'error',
        sessions: lock.holders,
        details: { filePath: lock.filePath },
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Conflits de repertoire
    const sessions = this.tracker.getAllSessions().filter((s) => s.status === 'active');
    const dirMap = new Map(); // directory -> [sessionIds]
    for (const session of sessions) {
      if (session.directory) {
        const dir = session.directory.toLowerCase().replace(/\\/g, '/');
        if (!dirMap.has(dir)) dirMap.set(dir, []);
        dirMap.get(dir).push(session.id);
      }
    }
    for (const [dir, sessionIds] of dirMap) {
      if (sessionIds.length > 1) {
        const id = `dir:${dir}`;
        currentConflicts.set(id, {
          id,
          type: 'directory',
          severity: 'warning',
          sessions: sessionIds,
          details: { directory: dir },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 3. Detection de doublons de travail (taches similaires)
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i];
        const b = sessions[j];
        if (a.currentTask && b.currentTask) {
          const similarity = this._taskSimilarity(a.currentTask, b.currentTask);
          if (similarity > 0.65) { // seuil augmenté + stop-words pour reduire les faux positifs (#18)
            const id = `task:${[a.id, b.id].sort().join(':')}`;
            currentConflicts.set(id, {
              id,
              type: 'duplicate_task',
              severity: 'warning',
              sessions: [a.id, b.id],
              details: {
                tasks: [a.currentTask, b.currentTask],
                similarity: Math.round(similarity * 100),
              },
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Detecter les nouveaux conflits et les conflits resolus
    for (const [id, conflict] of currentConflicts) {
      if (!previousIds.has(id)) {
        this.broadcast('conflict:detected', conflict);
      }
    }
    for (const id of previousIds) {
      if (!currentConflicts.has(id)) {
        const resolved = this.conflicts.get(id);
        this.broadcast('conflict:resolved', resolved);
      }
    }

    this.conflicts = currentConflicts;
    this._persist();

    return Array.from(currentConflicts.values());
  }

  /**
   * Calcule une similarite entre deux descriptions de taches (#18).
   * Stop-words, tokenization et regex compilés au niveau module — pas de recréation par appel.
   * Token cache par texte de tâche — évite de retokenizer les mêmes tâches inchangées.
   */
  _taskSimilarity(taskA, taskB) {
    if (!this._tokenCache.has(taskA)) this._tokenCache.set(taskA, _tokenize(taskA));
    if (!this._tokenCache.has(taskB)) this._tokenCache.set(taskB, _tokenize(taskB));
    // Éviter une croissance infinie du cache (garde les 200 dernières entrées)
    if (this._tokenCache.size > 200) {
      const oldest = this._tokenCache.keys().next().value;
      this._tokenCache.delete(oldest);
    }
    const wordsA = this._tokenCache.get(taskA);
    const wordsB = this._tokenCache.get(taskB);
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let common = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) common++;
    }
    return common / Math.max(wordsA.size, wordsB.size);
  }

  /**
   * Retourne les conflits actifs.
   */
  getConflicts() {
    return Array.from(this.conflicts.values());
  }
}

module.exports = { ConflictDetector };

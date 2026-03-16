const { randomUUID } = require('crypto');

/**
 * TerminalTracker - Monitors multiple Claude Code terminal sessions.
 *
 * Collects the state of each active Claude session (what it's working on,
 * current status, recent actions) and provides a consolidated recap.
 */

class TerminalTracker {
  constructor(broadcast, store = null) {
    this.broadcast = broadcast;
    this.store = store;
    this.sessions = new Map();

    // Restaurer les sessions persistees
    if (this.store) {
      const saved = this.store.get('sessions');
      if (saved && Array.isArray(saved)) {
        for (const session of saved) {
          this.sessions.set(session.id, session);
        }
        console.log(`TerminalTracker: ${saved.length} session(s) restauree(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('sessions', Array.from(this.sessions.values()));
  }

  registerSession(sessionId, metadata) {
    const session = {
      id: sessionId,
      name: metadata.name || `Terminal ${this.sessions.size + 1}`,
      directory: metadata.directory || '',
      projectName: metadata.projectName || null,
      gitRemote: metadata.gitRemote || null,
      status: metadata.status || 'active',
      currentTask: null,
      thinkingState: null,
      history: [],
      taskQueue: [],
      gitStatus: null,
      usedAgents: {}, // { agentType: { count, lastUsedAt, calls: [{description, timestamp}] } }
      lastUpdate: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    this._persist();
    this.broadcast('session:registered', this._normalize(session));
    return session;
  }

  updateSession(sessionId, update) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (update.currentTask !== undefined) session.currentTask = update.currentTask;
    if (update.thinkingState !== undefined) session.thinkingState = update.thinkingState;
    if (update.status !== undefined) session.status = update.status;
    session.lastUpdate = new Date().toISOString();

    if (update.action) {
      session.history.push({
        action: update.action,
        timestamp: new Date().toISOString(),
      });
      // Keep last 50 actions
      if (session.history.length > 50) session.history.shift();
    }

    this._persist();
    // Broadcaster une version normalisee (recentActions au lieu de history brut)
    this.broadcast('session:updated', this._normalize(session));
    return session;
  }

  /**
   * Ajoute une tache a la file d'attente d'une session.
   */
  queueTask(sessionId, task) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (!session.taskQueue) session.taskQueue = [];
    const entry = { id: randomUUID(), task, queuedAt: new Date().toISOString() };
    session.taskQueue.push(entry);
    this._persist();
    this.broadcast('session:updated', this._normalize(session));
    return entry;
  }

  /**
   * Retire et retourne la prochaine tache de la file.
   */
  dequeueTask(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.taskQueue || session.taskQueue.length === 0) return null;
    const next = session.taskQueue.shift();
    this._persist();
    this.broadcast('session:updated', this._normalize(session));
    return next;
  }

  /**
   * Enregistre l'invocation d'un agent subagent par une session.
   */
  addAgentInvocation(sessionId, agentType, description) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (!session.usedAgents) session.usedAgents = {};

    const now = new Date().toISOString();
    const entry = session.usedAgents[agentType] || { count: 0, lastUsedAt: null, calls: [] };
    entry.count += 1;
    entry.lastUsedAt = now;
    entry.calls.push({ description: description || '', timestamp: now });
    // Garder les 50 derniers appels par type
    if (entry.calls.length > 50) entry.calls.shift();
    session.usedAgents[agentType] = entry;
    session.lastUpdate = now;

    this._persist();
    this.broadcast('agent:invoked', {
      sessionId,
      agentType,
      description: description || '',
      count: entry.count,
      timestamp: now,
    });
    this.broadcast('session:updated', this._normalize(session));
    return entry;
  }

  /**
   * Met a jour le statut git d'une session.
   */
  setGitStatus(sessionId, gitStatus) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.gitStatus = gitStatus;
    session.lastUpdate = new Date().toISOString();
    this._persist();
    this.broadcast('session:updated', this._normalize(session));
    return session;
  }

  /**
   * Retourne une session par son ID (acces direct O(1)).
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Retourne une vue normalisee d'une session pour le broadcast.
   */
  _normalize(session) {
    return {
      id: session.id,
      name: session.name,
      directory: session.directory,
      projectName: session.projectName,
      gitRemote: session.gitRemote,
      status: session.status,
      currentTask: session.currentTask,
      thinkingState: session.thinkingState,
      lastUpdate: session.lastUpdate,
      startedAt: session.startedAt,
      recentActions: session.history.slice(-5),
      taskQueue: session.taskQueue || [],
      gitStatus: session.gitStatus || null,
      usedAgents: session.usedAgents || {},
    };
  }

  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this._persist();
      this.broadcast('session:removed', { id: sessionId });
    }
    return session;
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Marque les sessions inactives depuis trop longtemps comme stale,
   * puis purge les sessions stale apres purgeAge.
   * Appeler periodiquement (ex: toutes les 60s).
   *
   * @param {number} maxAge - Delai avant passage en stale (defaut: 2min)
   * @param {number} purgeAge - Delai avant suppression des sessions stale (defaut: 10min)
   */
  cleanupStale(maxAge = 120000, purgeAge = 600000) {
    const now = Date.now();
    let changed = false;

    const toRemove = [];
    for (const session of this.sessions.values()) {
      const lastUpdate = new Date(session.lastUpdate).getTime();
      const age = now - lastUpdate;

      if (session.status === 'active' && age > maxAge) {
        // Pas de heartbeat depuis maxAge -> stale
        session.status = 'stale';
        changed = true;
        this.broadcast('session:stale', session);
      } else if (session.status === 'stale' && age > purgeAge) {
        // Stale depuis trop longtemps -> purge
        toRemove.push(session.id);
      }
    }

    for (const id of toRemove) {
      this.sessions.delete(id);
      changed = true;
      this.broadcast('session:purged', { id });
    }

    if (changed) this._persist();
  }

  /**
   * Returns a consolidated recap of all active sessions.
   */
  getRecap() {
    const sessions = this.getAllSessions();
    const active = sessions.filter((s) => s.status === 'active');
    const idle = sessions.filter((s) => s.status === 'idle');
    const errored = sessions.filter((s) => s.status === 'error');
    const stale = sessions.filter((s) => s.status === 'stale');
    const disconnected = sessions.filter((s) => s.status === 'disconnected');

    return {
      totalSessions: sessions.length,
      active: active.length,
      idle: idle.length,
      errored: errored.length,
      stale: stale.length,
      disconnected: disconnected.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        directory: s.directory,
        status: s.status,
        currentTask: s.currentTask,
        thinkingState: s.thinkingState,
        lastUpdate: s.lastUpdate,
        recentActions: s.history.slice(-5),
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { TerminalTracker };

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
      lastUpdate: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    this._persist();
    this.broadcast('session:registered', session);
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
    this.broadcast('session:updated', session);
    return session;
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
   * Marque les sessions inactives depuis trop longtemps comme stale.
   * Appeler periodiquement (ex: toutes les 60s).
   */
  cleanupStale(maxAge = 120000) {
    const now = Date.now();
    let changed = false;
    for (const session of this.sessions.values()) {
      if (session.status === 'active') {
        const lastUpdate = new Date(session.lastUpdate).getTime();
        if (now - lastUpdate > maxAge) {
          session.status = 'stale';
          changed = true;
          this.broadcast('session:stale', session);
        }
      }
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

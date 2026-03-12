/**
 * TerminalTracker - Monitors multiple Claude Code terminal sessions.
 *
 * Collects the state of each active Claude session (what it's working on,
 * current status, recent actions) and provides a consolidated recap.
 */

class TerminalTracker {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.sessions = new Map();
  }

  registerSession(sessionId, metadata) {
    const session = {
      id: sessionId,
      name: metadata.name || `Terminal ${this.sessions.size + 1}`,
      directory: metadata.directory || '',
      status: 'active',
      currentTask: null,
      thinkingState: null,
      history: [],
      lastUpdate: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
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

    this.broadcast('session:updated', session);
    return session;
  }

  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.broadcast('session:removed', { id: sessionId });
    }
    return session;
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Returns a consolidated recap of all active sessions.
   */
  getRecap() {
    const sessions = this.getAllSessions();
    const active = sessions.filter((s) => s.status === 'active');
    const idle = sessions.filter((s) => s.status === 'idle');
    const errored = sessions.filter((s) => s.status === 'error');

    return {
      totalSessions: sessions.length,
      active: active.length,
      idle: idle.length,
      errored: errored.length,
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

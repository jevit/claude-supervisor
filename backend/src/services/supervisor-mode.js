const crypto = require('crypto');

/**
 * SupervisorMode - Delegation automatique de sous-taches.
 *
 * Analyse les sessions actives et leur charge de travail,
 * puis suggere ou assigne automatiquement des taches
 * aux sessions les moins chargees.
 */
class SupervisorMode {
  constructor(tracker, messageBus, broadcast, store = null) {
    this.tracker = tracker;
    this.messageBus = messageBus;
    this.broadcast = broadcast;
    this.store = store;
    this.enabled = false;
    this.taskQueue = []; // Taches en attente de delegation
    this.delegations = []; // Historique des delegations

    // Restaurer l'etat persiste
    if (this.store) {
      const saved = this.store.get('supervisorMode');
      if (saved) {
        this.enabled = saved.enabled || false;
        this.taskQueue = saved.taskQueue || [];
        this.delegations = saved.delegations || [];
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('supervisorMode', {
      enabled: this.enabled,
      taskQueue: this.taskQueue,
      delegations: this.delegations.slice(-100),
    });
  }

  /**
   * Active/desactive le mode superviseur.
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this._persist();
    this.broadcast('supervisor:mode', { enabled });
    return this.enabled;
  }

  /**
   * Ajoute une tache a la file d'attente de delegation.
   */
  enqueueTask(task) {
    const entry = {
      id: crypto.randomUUID(),
      description: task.description,
      priority: task.priority || 'normal', // low, normal, high, critical
      requiredSkills: task.requiredSkills || [],
      preferredSession: task.preferredSession || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.taskQueue.push(entry);
    this._persist();
    this.broadcast('supervisor:task-queued', entry);

    // Si mode auto, tenter une delegation immediate
    if (this.enabled) {
      this._tryDelegate(entry);
    }
    return entry;
  }

  /**
   * Evalue la charge de travail d'une session (0-100).
   */
  _sessionLoad(session) {
    let load = 0;
    if (session.status === 'active') load += 30;
    if (session.currentTask) load += 40;
    if (session.thinkingState) load += 20;
    const recentActions = (session.history || []).filter((a) => {
      return Date.now() - new Date(a.timestamp).getTime() < 300000; // 5min
    });
    load += Math.min(recentActions.length * 5, 30);
    return Math.min(load, 100);
  }

  /**
   * Tente de deleguer une tache a la session la moins chargee.
   */
  _tryDelegate(task) {
    const sessions = this.tracker.getAllSessions().filter((s) => s.status === 'active');
    if (sessions.length === 0) return null;

    // Calculer la charge de chaque session
    const candidates = sessions.map((s) => ({
      session: s,
      load: this._sessionLoad(s),
    }));

    // Preferer la session demandee si disponible et pas surchargee
    if (task.preferredSession) {
      const preferred = candidates.find((c) => c.session.id === task.preferredSession);
      if (preferred && preferred.load < 70) {
        return this._delegate(task, preferred.session);
      }
    }

    // Trier par charge croissante et prendre la moins chargee
    candidates.sort((a, b) => a.load - b.load);
    const best = candidates[0];
    if (best.load < 80) {
      return this._delegate(task, best.session);
    }

    // Toutes les sessions sont surchargees
    this.broadcast('supervisor:overloaded', {
      taskId: task.id,
      message: 'Toutes les sessions sont surchargees',
    });
    return null;
  }

  /**
   * Effectue la delegation d'une tache a une session.
   */
  _delegate(task, session) {
    task.status = 'delegated';
    task.delegatedTo = session.id;
    task.delegatedAt = new Date().toISOString();

    const delegation = {
      id: crypto.randomUUID(),
      taskId: task.id,
      sessionId: session.id,
      sessionName: session.name,
      description: task.description,
      priority: task.priority,
      timestamp: new Date().toISOString(),
    };

    this.delegations.push(delegation);

    // Envoyer un message a la session cible
    this.messageBus.send('supervisor', session.id, {
      type: 'task_delegation',
      content: `[Superviseur] Nouvelle tache: ${task.description} (priorite: ${task.priority})`,
    });

    this._persist();
    this.broadcast('supervisor:delegated', delegation);
    return delegation;
  }

  /**
   * Retourne le statut du mode superviseur.
   */
  getStatus() {
    const sessions = this.tracker.getAllSessions().filter((s) => s.status === 'active');
    return {
      enabled: this.enabled,
      pendingTasks: this.taskQueue.filter((t) => t.status === 'pending').length,
      delegatedTasks: this.taskQueue.filter((t) => t.status === 'delegated').length,
      totalDelegations: this.delegations.length,
      sessionLoads: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        load: this._sessionLoad(s),
        currentTask: s.currentTask,
      })),
    };
  }

  /**
   * Retourne la file d'attente.
   */
  getQueue() {
    return [...this.taskQueue].reverse();
  }

  /**
   * Retourne l'historique des delegations.
   */
  getDelegations(limit = 50) {
    return [...this.delegations].reverse().slice(0, limit);
  }

  /**
   * Force la delegation de toutes les taches en attente.
   */
  delegateAll() {
    const pending = this.taskQueue.filter((t) => t.status === 'pending');
    const results = [];
    for (const task of pending) {
      const result = this._tryDelegate(task);
      if (result) results.push(result);
    }
    return results;
  }

  /**
   * Annule une tache en attente.
   */
  cancelTask(taskId) {
    const task = this.taskQueue.find((t) => t.id === taskId);
    if (!task || task.status !== 'pending') return false;
    task.status = 'cancelled';
    this._persist();
    this.broadcast('supervisor:task-cancelled', { taskId });
    return true;
  }
}

module.exports = { SupervisorMode };

const crypto = require('crypto');

/**
 * EventLog - Journal unifie de tous les evenements du superviseur.
 *
 * Collecte les evenements de toutes les sources (sessions, agents, taches)
 * dans un journal chronologique avec persistance.
 */
class EventLog {
  constructor(store = null, options = {}) {
    this.store = store;
    this.maxEvents = options.maxEvents || 500;
    this.events = [];
    // Index incrémentaux — évitent de recalculer sur chaque GET
    this._sources = new Set();
    this._types   = new Set();

    // Restaurer les evenements persistes
    if (this.store) {
      const saved = this.store.get('events');
      if (saved && Array.isArray(saved)) {
        this.events = saved;
        for (const e of saved) {
          if (e.source) this._sources.add(e.source);
          if (e.type)   this._types.add(e.type);
        }
        console.log(`EventLog: ${saved.length} evenement(s) restaure(s)`);
      }
    }
  }

  /**
   * Enregistre un evenement dans le journal.
   * @param {string} type - Type d'evenement (ex: session:updated, task:completed)
   * @param {object} data - Donnees de l'evenement
   * @param {string} source - Source (sessionId, agentId, ou 'system')
   */
  log(type, data, source = 'system') {
    const event = {
      id: crypto.randomUUID(),
      type,
      source,
      data: this._summarize(type, data),
      timestamp: new Date().toISOString(),
    };

    this.events.push(event);
    this._sources.add(source);
    this._types.add(type);

    // Limiter la taille du journal
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    this._persist();
    return event;
  }

  /**
   * Resume les donnees pour eviter de stocker des objets trop volumineux.
   */
  _summarize(type, data) {
    if (!data) return {};

    switch (type) {
      case 'session:registered':
        return { sessionId: data.id, name: data.name, directory: data.directory };
      case 'session:updated':
        return {
          sessionId: data.id,
          name: data.name,
          status: data.status,
          currentTask: data.currentTask,
        };
      case 'session:removed':
        return { sessionId: data.id };
      case 'agent:created':
        return { agentId: data.id, name: data.name, role: data.role };
      case 'agent:removed':
        return { agentId: data.id };
      case 'task:started':
        return { agentId: data.agentId, taskId: data.task?.id };
      case 'task:completed':
        return { agentId: data.agentId, taskId: data.task?.id };
      case 'task:failed':
        return { agentId: data.agentId, taskId: data.task?.id, error: data.error };
      case 'terminal:spawned':
        return { terminalId: data.terminalId, name: data.name, directory: data.directory };
      case 'terminal:exited':
        return { terminalId: data.terminalId, exitCode: data.exitCode };
      case 'terminal:attention':
        return { terminalId: data.terminalId, name: data.name, reason: data.reason };
      case 'lock:acquired':
      case 'lock:released':
        return { lockId: data.id, file: data.file, sessionId: data.sessionId };
      case 'lock:released-all':
        return { sessionId: data.sessionId, count: data.count };
      case 'conflict:detected':
        return { file: data.file, sessions: data.sessions };
      case 'context:set':
        return { key: data.key, source: data.source };
      case 'squad:created':
        return { id: data.id, name: data.name, memberCount: data.memberCount };
      case 'squad:completed':
      case 'squad:cancelled':
        return { id: data.id, name: data.name };
      case 'squad:member-started':
        return { squadId: data.squadId, memberName: data.memberName, terminalId: data.terminalId };
      case 'message:sent':
        return { from: data.from, to: data.to, preview: String(data.content || '').slice(0, 80) };
      default:
        // Pour les types inconnus, garder un resume compact
        return typeof data === 'object' ? { id: data.id } : {};
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('events', this.events);
  }

  /**
   * Recupere les evenements avec filtres optionnels.
   * Single-pass depuis la fin : évite 2 filter() + slice() + reverse().
   */
  getEvents(filters = {}) {
    const limit = filters.limit ? parseInt(filters.limit, 10) : 100;
    const typeFilter   = filters.type   || null;
    const sourceFilter = filters.source || null;
    const result = [];
    for (let i = this.events.length - 1; i >= 0 && result.length < limit; i--) {
      const e = this.events[i];
      if (typeFilter   && e.type   !== typeFilter)   continue;
      if (sourceFilter && e.source !== sourceFilter) continue;
      result.push(e);
    }
    return result;
  }

  /**
   * Retourne les types d'evenements distincts (pour les filtres frontend).
   * Index maintenu en temps réel — O(1).
   */
  getEventTypes() {
    return Array.from(this._types);
  }

  /**
   * Retourne les sources distinctes (pour les filtres frontend).
   * Index maintenu en temps réel — O(1).
   */
  getSources() {
    return Array.from(this._sources).filter(Boolean).sort();
  }
}

module.exports = { EventLog };

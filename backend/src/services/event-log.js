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

    // Restaurer les evenements persistes
    if (this.store) {
      const saved = this.store.get('events');
      if (saved && Array.isArray(saved)) {
        this.events = saved;
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
   */
  getEvents(filters = {}) {
    let result = [...this.events];

    if (filters.type) {
      result = result.filter((e) => e.type === filters.type);
    }
    if (filters.source) {
      result = result.filter((e) => e.source === filters.source);
    }

    // Ordre chronologique inverse (plus recent en premier)
    result.reverse();

    const limit = filters.limit ? parseInt(filters.limit, 10) : 100;
    return result.slice(0, limit);
  }

  /**
   * Retourne les types d'evenements distincts (pour les filtres frontend).
   */
  getEventTypes() {
    return [...new Set(this.events.map((e) => e.type))];
  }
}

module.exports = { EventLog };

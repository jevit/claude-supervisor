const crypto = require('crypto');

/**
 * MessageBus - Bus de messages inter-sessions.
 *
 * Permet aux sessions d'envoyer et recevoir des messages.
 * Supporte les messages directs (vers une session) et broadcasts (vers toutes).
 */
class MessageBus {
  constructor(broadcast, store = null, options = {}) {
    this.broadcast = broadcast;
    this.store = store;
    this.maxMessages = options.maxMessages || 500;
    this.messages = [];

    // Restaurer les messages persistes
    if (this.store) {
      const saved = this.store.get('messages');
      if (saved && Array.isArray(saved)) {
        this.messages = saved;
        console.log(`MessageBus: ${saved.length} message(s) restaure(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('messages', this.messages);
  }

  /**
   * Envoie un message.
   * @param {string} from - SessionId de l'expediteur (ou 'system')
   * @param {string} to - SessionId du destinataire (ou 'all' pour broadcast)
   * @param {object} payload - { type, content }
   */
  send(from, to, payload) {
    // Accepter une chaine comme contenu (rétrocompatibilité)
    const p = typeof payload === 'string' ? { type: 'info', content: payload } : (payload || {});
    const message = {
      id: crypto.randomUUID(),
      from,
      to,
      type: p.type || 'info',
      content: p.content || '',
      read: false,
      timestamp: new Date().toISOString(),
    };

    this.messages.push(message);

    // Limiter la taille
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    this._persist();
    this.broadcast('message:received', message);
    return message;
  }

  /**
   * Recupere les messages pour une session (directs + broadcasts).
   */
  getMessages(sessionId, options = {}) {
    let result = this.messages.filter(
      (m) => m.to === sessionId || m.to === 'all'
    );

    if (options.unreadOnly) {
      result = result.filter((m) => !m.read);
    }

    // Plus recent en premier
    return [...result].reverse();
  }

  /**
   * Recupere tous les messages (pour la vue admin/dashboard).
   */
  getAllMessages(limit = 100) {
    return [...this.messages].reverse().slice(0, limit);
  }

  /**
   * Marque un message comme lu.
   */
  markRead(messageId) {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return false;
    msg.read = true;
    this._persist();
    return true;
  }

  /**
   * Compte les messages non lus pour une session.
   */
  getUnreadCount(sessionId) {
    return this.messages.filter(
      (m) => (m.to === sessionId || m.to === 'all') && !m.read
    ).length;
  }
}

module.exports = { MessageBus };

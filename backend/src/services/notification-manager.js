const crypto = require('crypto');

/**
 * NotificationManager - Gestion des notifications du superviseur.
 *
 * Genere des notifications a partir des evenements importants
 * et les stocke pour consultation dans le dashboard.
 */

// Regles de generation de notifications a partir des evenements
const NOTIFICATION_RULES = {
  'health:fail': {
    severity: 'error',
    title: (data) => `Health check echoue: ${data.name}`,
    message: (data) => data.error || `Le check "${data.name}" a echoue`,
  },
  'conflict:detected': {
    severity: 'warning',
    title: (data) => `Conflit detecte`,
    message: (data) => {
      if (data.type === 'file') return `Fichier ${data.details?.filePath} modifie par ${data.sessions?.length} sessions`;
      if (data.type === 'directory') return `${data.sessions?.length} sessions dans ${data.details?.directory}`;
      return 'Conflit entre sessions';
    },
  },
  'env:changed': {
    severity: 'info',
    title: (data) => `Fichier modifie: ${data.fileName}`,
    message: (data) => `Le fichier ${data.fileName} a ete modifie`,
  },
  'task:failed': {
    severity: 'error',
    title: () => 'Tache echouee',
    message: (data) => data.error || 'Une tache a echoue',
  },
  'session:registered': {
    severity: 'info',
    title: (data) => `Nouvelle session: ${data.name}`,
    message: (data) => `Session "${data.name}" enregistree`,
  },
};

class NotificationManager {
  constructor(store = null, options = {}) {
    this.store = store;
    this.maxNotifications = options.maxNotifications || 200;
    this.notifications = [];

    // Restaurer les notifications persistees
    if (this.store) {
      const saved = this.store.get('notifications');
      if (saved && Array.isArray(saved)) {
        this.notifications = saved;
        console.log(`NotificationManager: ${saved.length} notification(s) restauree(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('notifications', this.notifications);
  }

  /**
   * Traite un evenement et genere une notification si necessaire.
   * Retourne la notification creee ou null.
   */
  processEvent(event, data) {
    const rule = NOTIFICATION_RULES[event];
    if (!rule) return null;

    const notification = {
      id: crypto.randomUUID(),
      type: event,
      severity: rule.severity,
      title: rule.title(data || {}),
      message: rule.message(data || {}),
      read: false,
      timestamp: new Date().toISOString(),
    };

    this.notifications.push(notification);

    // Limiter la taille
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(-this.maxNotifications);
    }

    this._persist();
    return notification;
  }

  /**
   * Retourne les notifications (plus recentes en premier).
   */
  getNotifications(options = {}) {
    let result = [...this.notifications];

    if (options.unreadOnly) {
      result = result.filter((n) => !n.read);
    }

    return result.reverse().slice(0, options.limit || 50);
  }

  /**
   * Marque une notification comme lue.
   */
  markRead(notificationId) {
    const notif = this.notifications.find((n) => n.id === notificationId);
    if (!notif) return false;
    notif.read = true;
    this._persist();
    return true;
  }

  /**
   * Marque toutes les notifications comme lues.
   */
  markAllRead() {
    for (const n of this.notifications) {
      n.read = true;
    }
    this._persist();
  }

  /**
   * Compte les notifications non lues.
   */
  getUnreadCount() {
    return this.notifications.filter((n) => !n.read).length;
  }
}

module.exports = { NotificationManager };

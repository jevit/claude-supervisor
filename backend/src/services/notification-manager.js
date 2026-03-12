const crypto = require('crypto');

/**
 * NotificationManager - Gestion des notifications du superviseur.
 *
 * Genere des notifications a partir des evenements importants
 * et les stocke pour consultation dans le dashboard.
 * Regles configurables via API (ajout/suppression/modification).
 */

// Regles par defaut de generation de notifications
const DEFAULT_RULES = {
  'health:fail': {
    severity: 'error',
    titleTemplate: 'Health check echoue: {name}',
    messageTemplate: 'Le check "{name}" a echoue',
    builtin: true,
  },
  'conflict:detected': {
    severity: 'warning',
    titleTemplate: 'Conflit detecte',
    messageTemplate: 'Conflit entre sessions',
    builtin: true,
  },
  'env:changed': {
    severity: 'info',
    titleTemplate: 'Fichier modifie: {fileName}',
    messageTemplate: 'Le fichier {fileName} a ete modifie',
    builtin: true,
  },
  'task:failed': {
    severity: 'error',
    titleTemplate: 'Tache echouee',
    messageTemplate: 'Une tache a echoue',
    builtin: true,
  },
  'session:registered': {
    severity: 'info',
    titleTemplate: 'Nouvelle session: {name}',
    messageTemplate: 'Session "{name}" enregistree',
    builtin: true,
  },
};

/**
 * Remplace les {key} dans un template par les valeurs de data.
 */
function applyTemplate(template, data) {
  if (!template || !data) return template || '';
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (data[key] !== undefined) return String(data[key]);
    if (data.details && data.details[key] !== undefined) return String(data.details[key]);
    return `{${key}}`;
  });
}

class NotificationManager {
  constructor(store = null, options = {}) {
    this.store = store;
    this.maxNotifications = options.maxNotifications || 200;
    this.notifications = [];
    // Regles configurables (copie des regles par defaut)
    this.rules = {};
    for (const [event, rule] of Object.entries(DEFAULT_RULES)) {
      this.rules[event] = { ...rule };
    }

    // Restaurer les donnees persistees
    if (this.store) {
      const saved = this.store.get('notifications');
      if (saved && Array.isArray(saved)) {
        this.notifications = saved;
        console.log(`NotificationManager: ${saved.length} notification(s) restauree(s)`);
      }
      // Restaurer les regles personnalisees
      const savedRules = this.store.get('notificationRules');
      if (savedRules && typeof savedRules === 'object') {
        for (const [event, rule] of Object.entries(savedRules)) {
          this.rules[event] = { ...rule, builtin: false };
        }
        console.log(`NotificationManager: ${Object.keys(savedRules).length} regle(s) personnalisee(s) restauree(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('notifications', this.notifications);
  }

  _persistRules() {
    if (!this.store) return;
    // Ne persister que les regles non-builtin
    const custom = {};
    for (const [event, rule] of Object.entries(this.rules)) {
      if (!rule.builtin) {
        custom[event] = { severity: rule.severity, titleTemplate: rule.titleTemplate, messageTemplate: rule.messageTemplate };
      }
    }
    this.store.set('notificationRules', custom);
  }

  /**
   * Ajoute ou remplace une regle de notification.
   */
  addRule(event, rule) {
    this.rules[event] = {
      severity: rule.severity || 'info',
      titleTemplate: rule.titleTemplate || rule.title || event,
      messageTemplate: rule.messageTemplate || rule.message || '',
      // Supporter aussi les fonctions (usage programmatique)
      title: typeof rule.title === 'function' ? rule.title : null,
      message: typeof rule.message === 'function' ? rule.message : null,
      builtin: false,
    };
    this._persistRules();
    return this.rules[event];
  }

  /**
   * Supprime une regle de notification.
   */
  removeRule(event) {
    if (this.rules[event]) {
      delete this.rules[event];
      this._persistRules();
      return true;
    }
    return false;
  }

  /**
   * Retourne toutes les regles (pour affichage/configuration).
   */
  getRules() {
    const result = {};
    for (const [event, rule] of Object.entries(this.rules)) {
      result[event] = {
        severity: rule.severity,
        titleTemplate: rule.titleTemplate,
        messageTemplate: rule.messageTemplate,
        builtin: !!rule.builtin,
      };
    }
    return result;
  }

  /**
   * Traite un evenement et genere une notification si necessaire.
   * Retourne la notification creee ou null.
   */
  processEvent(event, data) {
    const rule = this.rules[event];
    if (!rule) return null;

    // Utiliser les fonctions si disponibles, sinon les templates
    let title, message;
    if (typeof rule.title === 'function') {
      title = rule.title(data || {});
    } else {
      title = applyTemplate(rule.titleTemplate, data || {});
    }
    if (typeof rule.message === 'function') {
      message = rule.message(data || {});
    } else {
      message = applyTemplate(rule.messageTemplate, data || {});
    }

    const notification = {
      id: crypto.randomUUID(),
      type: event,
      severity: rule.severity,
      title,
      message,
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

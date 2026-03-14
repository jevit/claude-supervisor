/**
 * WsProtocol - Protocole WebSocket pour distinguer clients dashboard et terminaux.
 *
 * Les clients dashboard recoivent les broadcasts (lectures seules).
 * Les clients terminaux s'enregistrent, envoient des updates et des heartbeats.
 * Un terminal sans heartbeat pendant 30s est automatiquement deconnecte.
 */

class WsProtocol {
  constructor(wss, tracker, broadcast, options = {}) {
    this.wss = wss;
    this.tracker = tracker;
    this.broadcast = broadcast;
    this.lockManager = options.lockManager || null;
    this.messageBus = options.messageBus || null;
    this.approvalRules = options.approvalRules || null;
    this.heartbeatTimeout = options.heartbeatTimeout || 30000;

    // Map ws -> { type: 'dashboard'|'terminal', sessionId?, heartbeatTimer? }
    this.clients = new Map();

    // Map sessionId -> ws pour envoyer des commandes aux terminaux connectes
    this.terminals = new Map();

    this._setupConnectionHandler();
  }

  _setupConnectionHandler() {
    this.wss.on('connection', (ws, req) => {
      // Par defaut, un client est un dashboard
      this.clients.set(ws, { type: 'dashboard' });

      // Envoyer l'etat initial
      this._sendTo(ws, 'init', {
        recap: this.tracker.getRecap(),
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          this._handleMessage(ws, msg);
        } catch {
          this._sendTo(ws, 'error', { message: 'Invalid JSON' });
        }
      });

      ws.on('close', () => {
        this._handleDisconnect(ws);
      });
    });
  }

  _handleMessage(ws, msg) {
    const { type, data } = msg;

    switch (type) {
      case 'register':
        this._handleRegister(ws, data);
        break;
      case 'update':
        this._handleUpdate(ws, data);
        break;
      case 'heartbeat':
        this._handleHeartbeat(ws);
        break;
      case 'lock':
        this._handleLock(ws, data);
        break;
      case 'unlock':
        this._handleUnlock(ws, data);
        break;
      case 'message':
        this._handleSendMessage(ws, data);
        break;
      case 'disconnect':
        this._handleDisconnect(ws);
        break;
      default:
        this._sendTo(ws, 'error', { message: `Unknown message type: ${type}` });
    }
  }

  /**
   * Un terminal s'enregistre avec ses metadonnees de session.
   */
  _handleRegister(ws, data) {
    if (!data || !data.sessionId) {
      this._sendTo(ws, 'error', { message: 'sessionId is required for register' });
      return;
    }

    const client = this.clients.get(ws);
    client.type = 'terminal';
    client.sessionId = data.sessionId;

    // Enregistrer la session dans le tracker
    const session = this.tracker.registerSession(data.sessionId, {
      name: data.name || `Terminal ${data.sessionId.substring(0, 8)}`,
      directory: data.directory || '',
    });

    // Stocker le ws pour envoi de commandes
    this.terminals.set(data.sessionId, ws);

    // Demarrer le heartbeat timer
    this._resetHeartbeat(ws);

    // Envoyer l'etat initial au terminal : messages en attente + locks actifs
    const pendingMessages = this.messageBus
      ? this.messageBus.getMessages(data.sessionId, { unreadOnly: true })
      : [];
    const activeLocks = [];
    if (this.lockManager) {
      for (const [filePath, holders] of this.lockManager.locks) {
        if (holders.has(data.sessionId)) activeLocks.push(filePath);
      }
    }

    const approvalRulesList = this.approvalRules ? this.approvalRules.getAll() : [];
    this._sendTo(ws, 'registered', { session, pendingMessages, activeLocks, approvalRules: approvalRulesList });
    console.log(`Terminal enregistre: ${data.sessionId}`);
  }

  /**
   * Un terminal envoie une mise a jour de sa session.
   */
  _handleUpdate(ws, data) {
    const client = this.clients.get(ws);
    if (!client || client.type !== 'terminal') {
      this._sendTo(ws, 'error', { message: 'Not registered as terminal' });
      return;
    }

    const session = this.tracker.updateSession(client.sessionId, data);
    if (session) {
      this._resetHeartbeat(ws);
      this._sendTo(ws, 'updated', { session });
    }
  }

  /**
   * Reset le timer de heartbeat. Si pas de heartbeat dans le delai, deconnexion.
   */
  _handleHeartbeat(ws) {
    const client = this.clients.get(ws);
    if (!client || client.type !== 'terminal') return;
    this._resetHeartbeat(ws);
    this._sendTo(ws, 'pong', {});
  }

  _resetHeartbeat(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    if (client.heartbeatTimer) {
      clearTimeout(client.heartbeatTimer);
    }

    client.heartbeatTimer = setTimeout(() => {
      console.log(`Terminal timeout (pas de heartbeat depuis ${this.heartbeatTimeout}ms): ${client.sessionId}`);
      this._cleanupTerminal(ws);
      ws.close();
    }, this.heartbeatTimeout);
  }

  _handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    if (client.type === 'terminal') {
      this._cleanupTerminal(ws);
      console.log(`Terminal deconnecte: ${client.sessionId}`);
    } else {
      console.log('Dashboard client deconnecte');
    }

    this.clients.delete(ws);
  }

  /**
   * Un terminal declare un lock sur un fichier.
   */
  _handleLock(ws, data) {
    const client = this.clients.get(ws);
    if (!client || client.type !== 'terminal') {
      this._sendTo(ws, 'error', { message: 'Not registered as terminal' });
      return;
    }
    if (!this.lockManager || !data?.filePath) {
      this._sendTo(ws, 'error', { message: 'filePath is required for lock' });
      return;
    }
    const result = this.lockManager.acquire(data.filePath, client.sessionId);
    this._sendTo(ws, 'locked', result);
  }

  /**
   * Un terminal libere un lock sur un fichier.
   */
  _handleUnlock(ws, data) {
    const client = this.clients.get(ws);
    if (!client || client.type !== 'terminal') {
      this._sendTo(ws, 'error', { message: 'Not registered as terminal' });
      return;
    }
    if (!this.lockManager || !data?.filePath) {
      this._sendTo(ws, 'error', { message: 'filePath is required for unlock' });
      return;
    }
    this.lockManager.release(data.filePath, client.sessionId);
    this._sendTo(ws, 'unlocked', { filePath: data.filePath });
  }

  /**
   * Un terminal envoie un message a une autre session.
   */
  _handleSendMessage(ws, data) {
    const client = this.clients.get(ws);
    if (!client || client.type !== 'terminal') {
      this._sendTo(ws, 'error', { message: 'Not registered as terminal' });
      return;
    }
    if (!this.messageBus || !data?.to || !data?.content) {
      this._sendTo(ws, 'error', { message: 'to and content are required for message' });
      return;
    }
    const msg = this.messageBus.send(client.sessionId, data.to, {
      type: data.type || 'info',
      content: data.content,
    });
    this._sendTo(ws, 'message:sent', msg);
  }

  _cleanupTerminal(ws) {
    const client = this.clients.get(ws);
    if (!client || client.type !== 'terminal') return;

    if (client.heartbeatTimer) {
      clearTimeout(client.heartbeatTimer);
    }

    // Retirer du registre des terminaux connectes
    if (client.sessionId) {
      this.terminals.delete(client.sessionId);
    }

    // Liberer tous les locks de cette session
    if (this.lockManager) {
      this.lockManager.releaseAll(client.sessionId);
    }

    // Marquer la session comme deconnectee plutot que la supprimer
    this.tracker.updateSession(client.sessionId, { status: 'disconnected' });
  }

  /**
   * Envoie un evenement a un terminal specifique par sessionId.
   * Retourne true si envoye, false si terminal non connecte.
   */
  sendToTerminal(sessionId, event, data) {
    const ws = this.terminals.get(sessionId);
    if (!ws) return false;
    this._sendTo(ws, event, data);
    return true;
  }

  /**
   * Envoie un evenement a TOUS les terminaux connectes.
   * Retourne le nombre de terminaux atteints.
   */
  broadcastToTerminals(event, data) {
    let count = 0;
    for (const ws of this.terminals.values()) {
      this._sendTo(ws, event, data);
      count++;
    }
    return count;
  }

  /**
   * Envoie un message a un client specifique.
   */
  _sendTo(ws, event, data) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ event, data, timestamp: new Date().toISOString() }));
    }
  }

  /**
   * Retourne les stats de connexion.
   */
  getStats() {
    let dashboards = 0;
    let terminals = 0;
    for (const client of this.clients.values()) {
      if (client.type === 'dashboard') dashboards++;
      if (client.type === 'terminal') terminals++;
    }
    return { dashboards, terminals, total: dashboards + terminals };
  }
}

module.exports = { WsProtocol };

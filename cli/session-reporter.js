#!/usr/bin/env node

/**
 * Session Reporter - Script CLI pour connecter un terminal Claude Code au superviseur.
 *
 * Se connecte au serveur WebSocket, s'enregistre comme terminal,
 * envoie des heartbeats et permet de rapporter l'activite via stdin.
 *
 * Usage:
 *   node session-reporter.js [--name "Nom"] [--url ws://localhost:3001] [--id <sessionId>]
 *
 * Commandes stdin:
 *   task <description>      - Met a jour la tache en cours
 *   action <description>    - Enregistre une action
 *   status <active|idle|error> - Change le statut
 *   thinking <description>  - Met a jour l'etat de reflexion
 *   quit                    - Deconnexion propre
 */

const crypto = require('crypto');
const path = require('path');
const readline = require('readline');

// Charger ws depuis les node_modules du backend
let WebSocket;
try {
  WebSocket = require('ws');
} catch {
  try {
    WebSocket = require(path.resolve(__dirname, '../backend/node_modules/ws'));
  } catch {
    console.error('Erreur: module "ws" introuvable. Lancez "npm install" dans backend/ d\'abord.');
    process.exit(1);
  }
}

/**
 * SessionReporter - Client WebSocket pour rapporter l'activite d'un terminal.
 */
class SessionReporter {
  constructor(options = {}) {
    this.url = options.url || 'ws://localhost:3001';
    this.name = options.name || `Terminal ${process.pid}`;
    this.sessionId = options.id || crypto.randomUUID();
    this.directory = options.directory || process.cwd();
    this.heartbeatInterval = options.heartbeatInterval || 10000;

    this.ws = null;
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
    this._maxReconnectDelay = 30000;
    this._connected = false;
    this._closing = false;
  }

  /**
   * Etablit la connexion WebSocket et s'enregistre.
   */
  connect() {
    if (this._closing) return;

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      console.error(`Erreur de connexion: ${err.message}`);
      this._scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this._connected = true;
      this._reconnectDelay = 1000;
      console.log(`Connecte a ${this.url}`);

      // S'enregistrer comme terminal
      this._send('register', {
        sessionId: this.sessionId,
        name: this.name,
        directory: this.directory,
      });

      // Demarrer les heartbeats
      this._startHeartbeat();
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handleMessage(msg);
      } catch {
        // Message non-JSON ignore
      }
    });

    this.ws.on('close', () => {
      this._connected = false;
      this._stopHeartbeat();

      if (!this._closing) {
        console.log('Connexion perdue, reconnexion...');
        this._scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      // Eviter le crash sur ECONNREFUSED
      if (err.code === 'ECONNREFUSED') {
        console.error(`Serveur non disponible sur ${this.url}`);
      } else {
        console.error(`Erreur WebSocket: ${err.message}`);
      }
    });
  }

  /**
   * Traite les messages recus du serveur.
   */
  _handleMessage(msg) {
    switch (msg.event) {
      case 'registered':
        console.log(`Session enregistree: ${this.sessionId.substring(0, 8)}... (${this.name})`);
        break;
      case 'updated':
        // Confirmation silencieuse
        break;
      case 'pong':
        // Reponse heartbeat, rien a faire
        break;
      case 'error':
        console.error(`Erreur serveur: ${msg.data?.message}`);
        break;
      case 'init':
        // Etat initial recu, on peut l'ignorer cote reporter
        break;
      default:
        // Autres evenements broadcast ignores
        break;
    }
  }

  /**
   * Envoie un message au serveur.
   */
  _send(type, data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, data }));
    return true;
  }

  /**
   * Demarre l'envoi periodique de heartbeats.
   */
  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      this._send('heartbeat', {});
    }, this.heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Reconnexion avec backoff exponentiel.
   */
  _scheduleReconnect() {
    if (this._closing || this._reconnectTimer) return;

    console.log(`Reconnexion dans ${this._reconnectDelay / 1000}s...`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this._reconnectDelay);

    // Backoff exponentiel
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
  }

  // --- API publique pour rapporter l'activite ---

  /**
   * Met a jour la tache en cours.
   */
  updateTask(description) {
    return this._send('update', { currentTask: description });
  }

  /**
   * Enregistre une action.
   */
  logAction(description) {
    return this._send('update', { action: description });
  }

  /**
   * Change le statut de la session.
   */
  setStatus(status) {
    return this._send('update', { status });
  }

  /**
   * Met a jour l'etat de reflexion.
   */
  setThinking(description) {
    return this._send('update', { thinkingState: description });
  }

  /**
   * Deconnexion propre.
   */
  disconnect() {
    this._closing = true;
    this._stopHeartbeat();

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.ws) {
      this._send('disconnect', {});
      this.ws.close();
      this.ws = null;
    }

    this._connected = false;
  }

  get isConnected() {
    return this._connected;
  }
}

// --- Mode CLI (execution directe) ---

if (require.main === module) {
  // Parser les arguments
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--name':
      case '-n':
        options.name = args[++i];
        break;
      case '--url':
      case '-u':
        options.url = args[++i];
        break;
      case '--id':
        options.id = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Session Reporter - Connecte un terminal au Claude Supervisor

Usage: node session-reporter.js [options]

Options:
  --name, -n <nom>    Nom de la session (defaut: Terminal <pid>)
  --url, -u <url>     URL du serveur WebSocket (defaut: ws://localhost:3001)
  --id <sessionId>    ID de session (defaut: UUID genere)
  --help, -h          Affiche cette aide

Commandes (stdin):
  task <description>      Met a jour la tache en cours
  action <description>    Enregistre une action
  status <active|idle|error>  Change le statut
  thinking <description>  Met a jour l'etat de reflexion
  quit                    Deconnexion propre
`);
        process.exit(0);
    }
  }

  const reporter = new SessionReporter(options);
  reporter.connect();

  // Interface readline pour les commandes
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  // Afficher le prompt seulement si stdin est un TTY
  if (process.stdin.isTTY) {
    rl.prompt();
  }

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (process.stdin.isTTY) rl.prompt();
      return;
    }

    const spaceIdx = trimmed.indexOf(' ');
    const cmd = spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx);
    const arg = spaceIdx === -1 ? '' : trimmed.substring(spaceIdx + 1).trim();

    switch (cmd.toLowerCase()) {
      case 'task':
        if (!arg) {
          console.log('Usage: task <description>');
        } else {
          reporter.updateTask(arg);
          console.log(`Tache: ${arg}`);
        }
        break;

      case 'action':
        if (!arg) {
          console.log('Usage: action <description>');
        } else {
          reporter.logAction(arg);
          console.log(`Action: ${arg}`);
        }
        break;

      case 'status':
        if (!['active', 'idle', 'error'].includes(arg)) {
          console.log('Usage: status <active|idle|error>');
        } else {
          reporter.setStatus(arg);
          console.log(`Statut: ${arg}`);
        }
        break;

      case 'thinking':
        if (!arg) {
          console.log('Usage: thinking <description>');
        } else {
          reporter.setThinking(arg);
          console.log(`Reflexion: ${arg}`);
        }
        break;

      case 'quit':
      case 'exit':
        console.log('Deconnexion...');
        reporter.disconnect();
        process.exit(0);
        break;

      case 'info':
        console.log(`Session: ${reporter.sessionId}`);
        console.log(`Nom: ${reporter.name}`);
        console.log(`Connecte: ${reporter.isConnected}`);
        console.log(`Serveur: ${reporter.url}`);
        break;

      case 'help':
        console.log('Commandes: task, action, status, thinking, info, quit');
        break;

      default:
        console.log(`Commande inconnue: ${cmd}. Tapez "help" pour la liste.`);
    }

    if (process.stdin.isTTY) rl.prompt();
  });

  rl.on('close', () => {
    reporter.disconnect();
    process.exit(0);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('\nArret...');
    reporter.disconnect();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { SessionReporter };

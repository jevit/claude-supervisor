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
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

/**
 * Detecte automatiquement un nom de session lisible.
 * Priorite : nom repo git > basename du repertoire > hostname.
 */
function detectSessionName(directory) {
  const dir = directory || process.cwd();
  try {
    // Essayer le nom du repo git (basename du root)
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).toString().trim();
    if (gitRoot) return path.basename(gitRoot);
  } catch {
    // Pas un repo git ou git absent
  }
  // Fallback : basename du repertoire courant
  return path.basename(dir) || os.hostname();
}

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
    this.directory = options.directory || process.cwd();
    this.name = options.name || detectSessionName(this.directory);
    this.sessionId = options.id || crypto.randomUUID();
    this.heartbeatInterval = options.heartbeatInterval || 10000;
    this.gitWatchInterval = options.gitWatchInterval || 30000;

    // Callback appele quand une commande est recue du dashboard
    this.onCommand = options.onCommand || null;

    this.ws = null;
    this._heartbeatTimer = null;
    this._gitTimer = null;
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
    this._maxReconnectDelay = 30000;
    this._connected = false;
    this._closing = false;
    this._paused = false;
    this._taskQueue = [];
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

      // Demarrer les heartbeats et le suivi git
      this._startHeartbeat();
      this._startGitWatch();
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
      this._stopGitWatch();

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
      case 'registered': {
        console.log(`Session enregistree: ${this.sessionId.substring(0, 8)}... (${this.name})`);
        // Afficher les messages en attente recus a la connexion
        const pending = msg.data?.pendingMessages || [];
        if (pending.length > 0) {
          console.log(`\n[${pending.length} message(s) en attente]`);
          for (const m of pending) {
            console.log(`  [${m.type.toUpperCase()}] de ${m.from}: ${m.content}`);
          }
          console.log('');
        }
        // Afficher les locks actifs
        const locks = msg.data?.activeLocks || [];
        if (locks.length > 0) {
          console.log(`[Locks actifs: ${locks.join(', ')}]`);
        }
        // Charger les regles d'auto-approbation
        this._approvalRules = msg.data?.approvalRules || [];
        if (this._approvalRules.length > 0) {
          console.log(`[${this._approvalRules.length} regle(s) d'auto-approbation chargee(s)]`);
        }
        break;
      }
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
        // Etat initial du dashboard, ignore cote reporter
        break;
      case 'command':
        this._handleCommand(msg.data);
        break;
      default:
        // Autres evenements broadcast ignores
        break;
    }
  }

  /**
   * Traite une commande recue du dashboard.
   */
  _handleCommand(data) {
    const { command, params } = data || {};
    console.log(`\n[COMMANDE DASHBOARD] ${command}${params?.message ? `: ${params.message}` : ''}`);

    switch (command) {
      case 'pause':
        this._paused = true;
        this.setStatus('idle');
        console.log('[Execution en pause - tapez "resume" pour continuer]');
        break;
      case 'resume':
        this._paused = false;
        this.setStatus('active');
        console.log('[Execution reprise]');
        break;
      case 'cancel':
        console.log('[Annulation demandee - arret en cours...]');
        this.setStatus('idle');
        break;
      case 'approve':
        console.log('[Approuve par le dashboard]');
        this.setStatus('active');
        break;
      case 'reject':
        console.log(`[Rejete par le dashboard${params?.reason ? `: ${params.reason}` : ''}]`);
        this.setStatus('idle');
        break;
      case 'message':
        if (params?.content) {
          console.log(`[Message: ${params.content}]`);
        }
        break;

      case 'rules:update':
        this._approvalRules = params?.rules || [];
        console.log(`[Regles mises a jour: ${this._approvalRules.length} regle(s)]`);
        break;

      case 'queue:add':
        if (params?.task) {
          this._taskQueue.push({ id: params.id, task: params.task });
          console.log(`\n[TACHE EN ATTENTE] "${params.task}" (${this._taskQueue.length} dans la file)`);
        }
        break;

      case 'queue:next': {
        const next = params?.task;
        if (next) {
          console.log(`\n[PROCHAINE TACHE] ${next}`);
          this.updateTask(next);
          this.setStatus('active');
        }
        break;
      }

      case 'inject': {
        const prompt = params?.prompt;
        if (prompt) {
          const border = '═'.repeat(Math.min(prompt.length + 4, 60));
          console.log(`\n╔${border}╗`);
          console.log(`║  PROMPT INJECTE DEPUIS LE DASHBOARD  ║`);
          console.log(`╠${border}╣`);
          console.log(`║  ${prompt}`);
          console.log(`╚${border}╝\n`);
          // Ecrire dans un fichier pour que Claude puisse le lire
          if (params.writeFile !== false) {
            const fs = require('fs');
            const injectPath = require('path').join(this.directory, '.claude-inject');
            fs.writeFileSync(injectPath, prompt, 'utf8');
            console.log(`[Prompt ecrit dans ${injectPath}]`);
          }
        }
        break;
      }
    }

    // Appeler le callback utilisateur si defini
    if (typeof this.onCommand === 'function') {
      this.onCommand(command, params);
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
   * Demarre la surveillance git periodique.
   */
  _startGitWatch() {
    this._stopGitWatch();
    this.reportGitStatus();
    this._gitTimer = setInterval(() => this.reportGitStatus(), this.gitWatchInterval);
  }

  _stopGitWatch() {
    if (this._gitTimer) {
      clearInterval(this._gitTimer);
      this._gitTimer = null;
    }
  }

  /**
   * Execute git status et envoie les infos au serveur.
   */
  reportGitStatus() {
    try {
      const { execSync } = require('child_process');
      const opts = { cwd: this.directory, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 };

      const branch = execSync('git rev-parse --abbrev-ref HEAD', opts).toString().trim();
      const shortStatus = execSync('git status --short', opts).toString().trim();

      const modified = [], staged = [], untracked = [];
      for (const line of shortStatus.split('\n').filter(Boolean)) {
        const xy = line.substring(0, 2);
        const file = line.substring(3);
        if (xy[0] !== ' ' && xy[0] !== '?') staged.push(file);
        if (xy[1] === 'M') modified.push(file);
        if (xy === '??') untracked.push(file);
      }

      // Ahead/behind
      let ahead = 0, behind = 0;
      try {
        const counts = execSync('git rev-list --count --left-right @{upstream}...HEAD', opts).toString().trim();
        const parts = counts.split('\t');
        behind = parseInt(parts[0]) || 0;
        ahead = parseInt(parts[1]) || 0;
      } catch { /* pas de remote */ }

      const gitStatus = { branch, modified, staged, untracked, ahead, behind };

      // Envoyer au serveur via REST (pas besoin d'un nouveau type WS)
      const http = require('http');
      const body = JSON.stringify(gitStatus);
      const urlObj = new URL(this.url.replace('ws://', 'http://').replace('wss://', 'https://'));
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 3001,
        path: `/api/sessions/${this.sessionId}/git-status`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      };
      const req = http.request(reqOptions);
      req.on('error', () => {});
      req.write(body);
      req.end();
    } catch {
      // Pas un repo git ou git absent, on ignore
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
   * Retourne la prochaine tache de la file locale et l'envoie comme tache active.
   */
  nextTask() {
    if (this._taskQueue.length === 0) return null;
    const entry = this._taskQueue.shift();
    this.updateTask(entry.task);
    this.setStatus('active');
    return entry.task;
  }

  get queueLength() {
    return this._taskQueue.length;
  }

  /**
   * Verifie les regles d'auto-approbation pour un texte donne.
   * Retourne 'approve', 'reject', ou null (pas de regle matchante).
   */
  checkAutoApproval(text) {
    if (!this._approvalRules) return null;
    for (const rule of this._approvalRules) {
      if (!rule.active) continue;
      try {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(text)) return rule.action;
      } catch {
        if (text.toLowerCase().includes(rule.pattern.toLowerCase())) return rule.action;
      }
    }
    return null;
  }

  /**
   * Met la session en attente d'approbation depuis le dashboard.
   * Verifie d'abord les regles d'auto-approbation.
   * Retourne 'approve', 'reject', ou 'pending' (en attente manuelle).
   */
  waitForApproval(reason) {
    const auto = this.checkAutoApproval(reason || '');
    if (auto === 'approve') {
      console.log(`[AUTO-APPROVE] Regle matchee pour: "${reason}"`);
      this.setStatus('active');
      return 'approve';
    }
    if (auto === 'reject') {
      console.log(`[AUTO-REJECT] Regle matchee pour: "${reason}"`);
      this.setStatus('idle');
      return 'reject';
    }
    this._send('update', { status: 'waiting_approval', currentTask: reason });
    return 'pending';
  }

  /**
   * Etat de pause.
   */
  get isPaused() {
    return this._paused;
  }

  /**
   * Deconnexion propre.
   */
  disconnect() {
    this._closing = true;
    this._stopHeartbeat();
    this._stopGitWatch();

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

      case 'next': {
        const t = reporter.nextTask();
        if (t) console.log(`Tache suivante: ${t}`);
        else console.log('File vide.');
        break;
      }

      case 'queue':
        console.log(`File (${reporter.queueLength} tache(s)):`);
        reporter._taskQueue.forEach((e, i) => console.log(`  ${i + 1}. ${e.task}`));
        break;

      case 'git':
        reporter.reportGitStatus();
        console.log('Statut git envoye.');
        break;

      case 'wait':
        reporter.waitForApproval(arg || 'En attente d\'approbation');
        console.log('Attente d\'approbation depuis le dashboard...');
        break;

      case 'send': {
        // Format: send <sessionId> <message>
        const spaceIdx2 = arg.indexOf(' ');
        if (spaceIdx2 === -1) {
          console.log('Usage: send <sessionId> <message>');
        } else {
          const to = arg.substring(0, spaceIdx2).trim();
          const content = arg.substring(spaceIdx2 + 1).trim();
          reporter._send('message', { to, content, type: 'info' });
          console.log(`Message envoye a ${to}: ${content}`);
        }
        break;
      }

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
        console.log(`Pause: ${reporter.isPaused}`);
        console.log(`Serveur: ${reporter.url}`);
        break;

      case 'help':
        console.log('Commandes: task, action, status, thinking, wait, send, info, quit');
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

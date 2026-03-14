const crypto = require('crypto');
const os = require('os');
const path = require('path');

let pty;
try {
  pty = require('node-pty');
} catch {
  console.warn('node-pty non disponible — lancement de terminaux desactive');
}

/**
 * TerminalManager - Lance et pilote des terminaux Claude Code depuis le backend.
 *
 * Utilise node-pty pour creer de vrais pseudo-terminaux,
 * capture la sortie en temps reel, et permet d'envoyer des commandes.
 */
class TerminalManager {
  constructor(tracker, broadcast, store = null, sharedContext = null) {
    this.tracker = tracker;
    this.broadcast = broadcast;
    this.store = store;
    this.sharedContext = sharedContext;
    // Map terminalId -> { pty, sessionId, buffer, ... }
    this.terminals = new Map();
    this.maxBufferSize = 50000; // Garder les derniers 50k chars par terminal
  }

  /**
   * Verifie si node-pty est disponible.
   */
  isAvailable() {
    return !!pty;
  }

  /**
   * Lance un nouveau terminal Claude Code.
   * @param {object} options - { directory, name, prompt, args }
   * @returns {{ terminalId, sessionId }}
   */
  spawn(options = {}) {
    if (!pty) throw new Error('node-pty non installe');

    const terminalId = crypto.randomUUID();
    const cwd = options.directory || process.cwd();
    const name = options.name || `Claude ${path.basename(cwd)}`;

    // Injecter le contexte partage dans le prompt si disponible et non desactive
    let effectivePrompt = options.prompt || null;
    if (options.injectContext !== false && this.sharedContext) {
      const entries = this.sharedContext.getAll()
        .filter((e) => !e.key.startsWith('squad:')); // Exclure le contexte interne des squads
      if (entries.length > 0) {
        const contextBlock = [
          '=== CONTEXTE PARTAGE (claude-supervisor) ===',
          ...entries.map((e) => `- ${e.key}: ${e.value}`),
          '============================================',
        ].join('\n');
        effectivePrompt = effectivePrompt
          ? `${contextBlock}\n\n${effectivePrompt}`
          : contextBlock;
      }
    }

    // Determiner le shell
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');

    // Construire la commande claude
    // Le prompt est un argument positionnel : claude [options] "prompt"
    const claudeArgs = ['claude'];
    if (options.dangerousMode) {
      claudeArgs.push('--dangerously-skip-permissions');
    }
    if (options.model) {
      claudeArgs.push('--model', options.model);
    }
    if (effectivePrompt) {
      // Echapper les guillemets pour eviter les injections dans le shell
      const escaped = effectivePrompt.replace(/"/g, '\\"');
      claudeArgs.push(`"${escaped}"`);
    }
    // On lance le shell, puis on executera claude dedans
    const shellArgs = isWindows ? ['/k', claudeArgs.join(' ')] : ['-c', claudeArgs.join(' ')];

    const term = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd,
      env: {
        ...process.env,
        CLAUDECODE: undefined, // Retirer pour eviter l'erreur "nested session"
        SUPERVISOR_URL: 'http://localhost:3001',
        SESSION_ID: terminalId,
        SESSION_NAME: name,
        FORCE_COLOR: '1',
      },
    });

    const termInfo = {
      id: terminalId,
      pty: term,
      sessionId: terminalId,
      name,
      directory: cwd,
      prompt: effectivePrompt,
      promptOriginal: options.prompt || null,
      contextInjected: effectivePrompt !== (options.prompt || null),
      model: options.model || null,
      buffer: '',
      status: 'running',
      pid: term.pid,
      createdAt: new Date().toISOString(),
    };

    // Capturer la sortie
    term.onData((data) => {
      termInfo.buffer += data;
      // Limiter la taille du buffer
      if (termInfo.buffer.length > this.maxBufferSize) {
        termInfo.buffer = termInfo.buffer.slice(-this.maxBufferSize);
      }

      // Broadcaster la sortie aux dashboards (WebSocket)
      this.broadcast('terminal:output', {
        terminalId,
        data,
        timestamp: new Date().toISOString(),
      });

      // Detecter si le terminal requiert l'attention de l'utilisateur
      // Ignorer les 15 premieres secondes (phase de demarrage)
      const age = Date.now() - new Date(termInfo.createdAt).getTime();
      if (age > 15000) {
        const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        if (this._needsAttention(clean)) {
          if (!termInfo._lastAttention || Date.now() - termInfo._lastAttention > 30000) {
            termInfo._lastAttention = Date.now();
            this.broadcast('terminal:attention', {
              terminalId,
              name: termInfo.name,
              reason: this._getAttentionReason(clean),
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    });

    // Detecter la fin du process
    term.onExit(({ exitCode, signal }) => {
      termInfo.status = 'exited';
      termInfo.exitCode = exitCode;
      termInfo.exitedAt = new Date().toISOString();

      this.broadcast('terminal:exited', {
        terminalId,
        exitCode,
        signal,
      });

      // Mettre a jour la session dans le tracker
      this.tracker.updateSession(terminalId, { status: 'disconnected' });
    });

    this.terminals.set(terminalId, termInfo);

    // Enregistrer comme session dans le tracker
    this.tracker.registerSession(terminalId, {
      name,
      directory: cwd,
      status: 'active',
    });

    this.broadcast('terminal:spawned', {
      terminalId,
      name,
      directory: cwd,
      pid: term.pid,
    });

    return { terminalId, sessionId: terminalId, pid: term.pid };
  }

  /**
   * Envoie du texte dans un terminal (comme si l'utilisateur tapait).
   */
  write(terminalId, data) {
    const term = this.terminals.get(terminalId);
    if (!term || term.status !== 'running') {
      throw new Error('Terminal non trouve ou arrete');
    }
    term.pty.write(data);
    return true;
  }

  /**
   * Redimensionne un terminal.
   */
  resize(terminalId, cols, rows) {
    const term = this.terminals.get(terminalId);
    if (!term || term.status !== 'running') return false;
    term.pty.resize(cols, rows);
    return true;
  }

  /**
   * Arrete un terminal.
   */
  kill(terminalId) {
    const term = this.terminals.get(terminalId);
    if (!term) return false;
    if (term.status === 'running') {
      term.pty.kill();
      term.status = 'killed';
    }
    return true;
  }

  /**
   * Recupere le buffer de sortie d'un terminal.
   */
  getOutput(terminalId, lastN = 5000) {
    const term = this.terminals.get(terminalId);
    if (!term) return null;
    return term.buffer.slice(-lastN);
  }

  /**
   * Liste tous les terminaux geres.
   */
  listTerminals() {
    return Array.from(this.terminals.values()).map((t) => ({
      id: t.id,
      name: t.name,
      directory: t.directory,
      status: t.status,
      pid: t.pid,
      prompt: t.prompt,
      model: t.model,
      createdAt: t.createdAt,
      exitedAt: t.exitedAt || null,
      bufferSize: t.buffer.length,
    }));
  }

  /**
   * Recupere les infos d'un terminal.
   */
  getTerminal(terminalId) {
    const t = this.terminals.get(terminalId);
    if (!t) return null;
    return {
      id: t.id,
      name: t.name,
      directory: t.directory,
      status: t.status,
      pid: t.pid,
      prompt: t.prompt,
      model: t.model,
      createdAt: t.createdAt,
      exitedAt: t.exitedAt || null,
      bufferSize: t.buffer.length,
    };
  }

  /**
   * Patterns indiquant que le terminal attend une action utilisateur.
   */
  _needsAttention(text) {
    // Patterns tres specifiques pour les prompts interactifs de Claude Code
    const patterns = [
      /\(y\/n\)\s*$/m,           // Prompt y/n en fin de ligne
      /\(Y\/n\)\s*$/m,           // Prompt Y/n en fin de ligne
      /Allow\s+Deny/,            // Boutons Allow/Deny de Claude Code
      /\? \(Use arrow keys\)/,   // Prompt de selection (select menu)
    ];
    return patterns.some((p) => p.test(text));
  }

  _getAttentionReason(text) {
    if (/Allow\s+Deny/.test(text)) return 'Permission requise';
    if (/\(y\/n\)/i.test(text)) return 'Confirmation requise';
    if (/Use arrow keys/.test(text)) return 'Selection requise';
    return 'Attention requise';
  }

  /**
   * Renomme un terminal.
   */
  rename(terminalId, newName) {
    const term = this.terminals.get(terminalId);
    if (!term) return false;
    term.name = newName;
    this.broadcast('terminal:renamed', { terminalId, name: newName });
    return true;
  }

  /**
   * Nettoie les terminaux termines.
   */
  cleanup() {
    for (const [id, term] of this.terminals) {
      if (term.status !== 'running') {
        this.terminals.delete(id);
      }
    }
  }

  /**
   * Arrete tous les terminaux (shutdown).
   */
  destroyAll() {
    for (const term of this.terminals.values()) {
      if (term.status === 'running') {
        try { term.pty.kill(); } catch {}
      }
    }
    this.terminals.clear();
  }
}

module.exports = { TerminalManager };

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

    // Persistance périodique (#86) — toutes les 30s pour survivre à un SIGKILL
    if (store) {
      this._persistTimer = setInterval(() => this.persistState(), 30000);
      this._persistTimer.unref?.(); // Ne pas bloquer la sortie du process
    }
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

    // Limite du nombre de terminaux actifs (#52)
    const maxTerminals = parseInt(process.env.MAX_TERMINALS || '10', 10);
    const activeCount = [...this.terminals.values()].filter((t) => t.status === 'running').length;
    if (activeCount >= maxTerminals) {
      throw new Error(`Limite de ${maxTerminals} terminaux actifs atteinte (MAX_TERMINALS)`);
    }

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
      // Mapper les alias courts vers les IDs officiels Claude (#19)
      const MODEL_ALIASES = {
        'sonnet': 'claude-sonnet-4-6',
        'opus':   'claude-opus-4-6',
        'haiku':  'claude-haiku-4-5-20251001',
      };
      const resolvedModel = MODEL_ALIASES[options.model.toLowerCase()] || options.model;
      if (!/^[a-zA-Z0-9._-]+$/.test(resolvedModel)) throw new Error('Nom de modele invalide');
      claudeArgs.push('--model', resolvedModel);
    }
    // Reprendre une session Claude Code précédente (#83)
    if (options.resumeSessionId && /^[a-zA-Z0-9_-]+$/.test(options.resumeSessionId)) {
      claudeArgs.push('--resume', options.resumeSessionId);
    }
    // Passer le prompt via variable d'environnement pour eviter toute injection shell.
    // Windows (#72) : cmd.exe avec /k garde la session ouverte — %VAR% est bien expansé.
    // Alternative plus fiable si problème : utiliser /c (ferme la session) ou passer via bash.exe.
    if (effectivePrompt && !options.resumeSessionId) {
      claudeArgs.push(isWindows ? '%CLAUDE_INITIAL_PROMPT%' : '"$CLAUDE_INITIAL_PROMPT"');
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
        // CLAUDECODE et CLAUDE_CODE_ENTRYPOINT sont positionnés par Claude Code dans ses processus enfants.
        // Les retirer évite l'erreur "nested Claude Code session" au démarrage. (#37)
        // Si Claude Code change ces variables de détection, les ajouter ici aussi.
        CLAUDECODE: undefined,
        CLAUDE_CODE_ENTRYPOINT: undefined,
        SUPERVISOR_URL: 'http://localhost:3001',
        SESSION_ID: terminalId,
        SESSION_NAME: name,
        FORCE_COLOR: '1',
        ...(effectivePrompt ? { CLAUDE_INITIAL_PROMPT: effectivePrompt } : {}),
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
      dangerousMode: options.dangerousMode || false,
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
      // Retirer ce terminal de la liste persistee (session terminee proprement)
      this.persistState();
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

    // Persister immediatement apres le spawn
    this.persistState();

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
      dangerousMode: t.dangerousMode || false,
      createdAt: t.createdAt,
      exitedAt: t.exitedAt || null,
      savedAt: t.savedAt || null,
      resumedAt: t.resumedAt || null,
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
      dangerousMode: t.dangerousMode || false,
      createdAt: t.createdAt,
      exitedAt: t.exitedAt || null,
      savedAt: t.savedAt || null,
      resumedAt: t.resumedAt || null,
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
    this.persistState();
    return true;
  }

  /* ── Persistance de session ──────────────────────────────────────── */

  /**
   * Sauvegarde l'etat des terminaux actifs dans le store.
   * Seuls les terminaux en cours (status 'running') sont sauvegardes.
   * Appele au spawn, exit, rename et shutdown.
   */
  persistState() {
    if (!this.store) return;
    const MAX_EXITED_AGE_MS = 24 * 3600 * 1000; // 24h pour les terminaux fermés
    const now = Date.now();
    const sessions = Array.from(this.terminals.values())
      .filter((t) => {
        if (t.status === 'running') return true;
        // Conserver aussi les terminaux récemment fermés (< 24h) pour permettre le relancement
        if ((t.status === 'exited' || t.status === 'killed') && t.exitedAt) {
          return (now - new Date(t.exitedAt).getTime()) < MAX_EXITED_AGE_MS;
        }
        return false;
      })
      .map((t) => ({
        id: t.id,
        name: t.name,
        directory: t.directory,
        prompt: t.promptOriginal || null,
        model: t.model || null,
        dangerousMode: t.dangerousMode || false,
        buffer: t.buffer.slice(-20000),
        createdAt: t.createdAt,
        exitedAt: t.exitedAt || null,
        status: t.status, // 'running' ou 'exited'/'killed'
        savedAt: new Date().toISOString(),
      }));
    this.store.set('terminals', sessions);
  }

  /**
   * Restaure les sessions interrompues depuis le store au demarrage.
   * Chaque session chargee devient une entree fantome (status 'ghost') :
   * elle apparait dans la liste et peut etre reprise via resume().
   */
  loadPersistedSessions() {
    if (!this.store) return 0;
    const sessions = this.store.get('terminals') || [];
    let count = 0;
    const MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 jours
    for (const s of sessions) {
      if (this.terminals.has(s.id)) continue;
      const age = Date.now() - new Date(s.savedAt || s.createdAt).getTime();
      if (age > MAX_AGE_MS) continue;
      // Les terminaux running au moment de la sauvegarde → ghost (interrompus inopinément)
      // Les terminaux exited/killed → restaurés avec leur statut d'origine pour permettre le relancement
      const wasRunning = !s.status || s.status === 'running';
      this.terminals.set(s.id, {
        id: s.id,
        pty: null,
        sessionId: s.id,
        name: s.name,
        directory: s.directory,
        prompt: s.prompt,
        promptOriginal: s.prompt,
        contextInjected: false,
        model: s.model || null,
        dangerousMode: s.dangerousMode || false,
        buffer: s.buffer || '',
        status: wasRunning ? 'ghost' : s.status,
        pid: null,
        createdAt: s.createdAt,
        exitedAt: s.exitedAt || null,
        savedAt: s.savedAt,
      });
      count++;
    }
    if (count > 0) {
      console.log(`TerminalManager: ${count} session(s) fantome(s) restauree(s) depuis le store`);
    }
    return count;
  }

  /**
   * Reprend une session fantome en relancant un nouveau PTY.
   * L'ID du terminal est conserve — le buffer existant est preserve.
   */
  resume(terminalId) {
    if (!pty) throw new Error('node-pty non disponible');
    const ghost = this.terminals.get(terminalId);
    if (!ghost) throw new Error('Terminal non trouve');
    if (ghost.status === 'running') throw new Error('Terminal deja actif');

    const cwd = ghost.directory || process.cwd();
    const name = ghost.name;
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : (process.env.SHELL || '/bin/bash');

    // Re-injecter le contexte partage si disponible
    let effectivePrompt = ghost.promptOriginal || null;
    if (this.sharedContext) {
      const entries = this.sharedContext.getAll().filter((e) => !e.key.startsWith('squad:'));
      if (entries.length > 0) {
        const contextBlock = [
          '=== CONTEXTE PARTAGE (claude-supervisor) ===',
          ...entries.map((e) => `- ${e.key}: ${e.value}`),
          '============================================',
        ].join('\n');
        effectivePrompt = effectivePrompt ? `${contextBlock}\n\n${effectivePrompt}` : contextBlock;
      }
    }

    const claudeArgs = ['claude'];
    if (ghost.dangerousMode) claudeArgs.push('--dangerously-skip-permissions');
    if (ghost.model) {
      if (!/^[a-zA-Z0-9._-]+$/.test(ghost.model)) throw new Error('Nom de modele invalide');
      claudeArgs.push('--model', ghost.model);
    }
    if (effectivePrompt) claudeArgs.push(isWindows ? '%CLAUDE_INITIAL_PROMPT%' : '"$CLAUDE_INITIAL_PROMPT"');
    const shellArgs = isWindows ? ['/k', claudeArgs.join(' ')] : ['-c', claudeArgs.join(' ')];

    const term = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd,
      env: {
        ...process.env,
        CLAUDECODE: undefined,
        SUPERVISOR_URL: 'http://localhost:3001',
        SESSION_ID: terminalId,
        SESSION_NAME: name,
        FORCE_COLOR: '1',
        ...(effectivePrompt ? { CLAUDE_INITIAL_PROMPT: effectivePrompt } : {}),
      },
    });

    // Mettre a jour l'entree existante en conservant l'ID et le buffer
    ghost.pty = term;
    ghost.status = 'running';
    ghost.pid = term.pid;
    ghost.resumedAt = new Date().toISOString();

    term.onData((data) => {
      ghost.buffer += data;
      if (ghost.buffer.length > this.maxBufferSize) {
        ghost.buffer = ghost.buffer.slice(-this.maxBufferSize);
      }
      this.broadcast('terminal:output', { terminalId, data, timestamp: new Date().toISOString() });
      const age = Date.now() - new Date(ghost.resumedAt).getTime();
      if (age > 15000) {
        const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        if (this._needsAttention(clean)) {
          if (!ghost._lastAttention || Date.now() - ghost._lastAttention > 30000) {
            ghost._lastAttention = Date.now();
            this.broadcast('terminal:attention', {
              terminalId, name: ghost.name,
              reason: this._getAttentionReason(clean),
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    });

    term.onExit(({ exitCode, signal }) => {
      ghost.status = 'exited';
      ghost.exitCode = exitCode;
      ghost.exitedAt = new Date().toISOString();
      this.broadcast('terminal:exited', { terminalId, exitCode, signal });
      this.tracker.updateSession(terminalId, { status: 'disconnected' });
      this.persistState();
    });

    // Restaurer la session sans ecraser l'historique existant
    if (!this.tracker.getSession(terminalId)) {
      this.tracker.registerSession(terminalId, { name, directory: cwd, status: 'active' });
    } else {
      this.tracker.updateSession(terminalId, { status: 'active' });
    }
    this.broadcast('terminal:resumed', { terminalId, name, directory: cwd, pid: term.pid });
    this.persistState();

    return { terminalId, pid: term.pid };
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

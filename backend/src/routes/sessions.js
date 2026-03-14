const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Liste toutes les sessions actives
router.get('/', (req, res) => {
  const tracker = req.app.locals.tracker;
  res.json(tracker.getAllSessions());
});

// Recap consolide de toutes les sessions, enrichi avec les infos terminaux
router.get('/recap', (req, res) => {
  const tracker = req.app.locals.tracker;
  const terminalManager = req.app.locals.terminalManager;
  const recap = tracker.getRecap();

  // Enrichir les sessions avec les infos des terminaux manages
  if (terminalManager) {
    const terminals = terminalManager.listTerminals();
    const terminalMap = new Map(terminals.map((t) => [t.id, t]));

    for (const session of recap.sessions) {
      const term = terminalMap.get(session.id);
      if (term) {
        session.isTerminal = true;
        session.terminalPid = term.pid;
        session.terminalStatus = term.status;
        session.terminalModel = term.model;
        session.terminalCreatedAt = term.createdAt;
        session.terminalExitedAt = term.exitedAt;
        // Corriger le status session pour refleter le vrai etat du terminal
        if (term.status === 'running' && session.status !== 'active') {
          session.status = 'active';
        } else if (term.status === 'exited' || term.status === 'killed') {
          session.status = 'disconnected';
        }
      }
    }

    // Ajouter les terminaux qui n'ont pas de session (ne devrait pas arriver)
    for (const term of terminals) {
      if (!recap.sessions.find((s) => s.id === term.id)) {
        recap.sessions.push({
          id: term.id,
          name: term.name,
          directory: term.directory,
          status: term.status === 'running' ? 'active' : 'disconnected',
          isTerminal: true,
          terminalPid: term.pid,
          terminalStatus: term.status,
          terminalModel: term.model,
          terminalCreatedAt: term.createdAt,
          terminalExitedAt: term.exitedAt,
          currentTask: null,
          thinkingState: null,
          lastUpdate: term.createdAt,
          recentActions: [],
        });
      }
    }

    // Recalculer les compteurs
    recap.totalSessions = recap.sessions.length;
    recap.active = recap.sessions.filter((s) => s.status === 'active').length;
    recap.disconnected = recap.sessions.filter((s) => s.status === 'disconnected').length;
  }

  res.json(recap);
});

// Enregistrer une nouvelle session
router.post('/', (req, res) => {
  const tracker = req.app.locals.tracker;
  const sessionId = req.body.id || crypto.randomUUID();
  const session = tracker.registerSession(sessionId, req.body);
  res.status(201).json(session);
});

// Mettre a jour une session existante
router.put('/:id', (req, res) => {
  const tracker = req.app.locals.tracker;
  const session = tracker.updateSession(req.params.id, req.body);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Envoyer un message a une session
router.post('/:id/message', (req, res) => {
  const messageBus = req.app.locals.messageBus;
  const { from, type, content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }
  const message = messageBus.send(from || 'dashboard', req.params.id, {
    type: type || 'info',
    content,
  });
  res.status(201).json(message);
});

// Heartbeat d'une session (appele automatiquement par les hooks Claude Code)
// Cree la session si elle n'existe pas, sinon met a jour lastUpdate + action
router.put('/:id/heartbeat', (req, res) => {
  const tracker = req.app.locals.tracker;
  const sessionId = req.params.id;
  const { action, directory, tool, timestamp } = req.body;

  // Verifier si la session existe
  let session = tracker.getAllSessions().find((s) => s.id === sessionId);

  if (!session) {
    // Auto-enregistrement via heartbeat
    session = tracker.registerSession(sessionId, {
      name: directory ? require('path').basename(directory) : `Terminal ${sessionId.substring(0, 8)}`,
      directory: directory || '',
      status: 'active',
    });
  }

  // Mettre a jour la session (status actif + action eventuelle)
  const update = { status: 'active' };
  if (action) update.action = action;

  const updated = tracker.updateSession(sessionId, update);
  res.json(updated || session);
});

// Ajouter une tache a la file d'attente d'une session
router.post('/:id/queue', (req, res) => {
  const tracker = req.app.locals.tracker;
  const wsProtocol = req.app.locals.wsProtocol;
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: 'task is required' });
  const entry = tracker.queueTask(req.params.id, task);
  if (!entry) return res.status(404).json({ error: 'Session not found' });
  // Notifier le terminal via WS
  wsProtocol.sendToTerminal(req.params.id, 'command', { command: 'queue:add', params: { task, id: entry.id } });
  res.status(201).json(entry);
});

// Depiler la prochaine tache de la file
router.delete('/:id/queue/next', (req, res) => {
  const tracker = req.app.locals.tracker;
  const wsProtocol = req.app.locals.wsProtocol;
  const next = tracker.dequeueTask(req.params.id);
  if (!next) return res.status(404).json({ error: 'File vide ou session introuvable' });
  wsProtocol.sendToTerminal(req.params.id, 'command', { command: 'queue:next', params: next });
  res.json(next);
});

// Injecter un prompt dans le terminal (affichage proeminant + fichier)
router.post('/:id/inject', (req, res) => {
  const wsProtocol = req.app.locals.wsProtocol;
  const { prompt, writeFile } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const sent = wsProtocol.sendToTerminal(req.params.id, 'command', {
    command: 'inject',
    params: { prompt, writeFile: writeFile !== false },
  });
  if (!sent) return res.status(404).json({ error: 'Terminal non connecte' });
  res.json({ sent: true, prompt });
});

// Mettre a jour le statut git d'une session (appele par le reporter)
router.post('/:id/git-status', (req, res) => {
  const tracker = req.app.locals.tracker;
  const { branch, modified, staged, untracked, ahead, behind } = req.body;
  const session = tracker.setGitStatus(req.params.id, { branch, modified, staged, untracked, ahead, behind });
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true });
});

// Envoyer une commande a un terminal connecte (pause, resume, cancel, approve, reject, message)
router.post('/:id/command', (req, res) => {
  const wsProtocol = req.app.locals.wsProtocol;
  const terminalManager = req.app.locals.terminalManager;
  const { command, params } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });

  // Essayer d'abord via WebSocket (session reporter)
  const sent = wsProtocol.sendToTerminal(req.params.id, 'command', { command, params: params || {} });
  if (sent) {
    return res.json({ sent: true, sessionId: req.params.id, command });
  }

  // Fallback: si c'est un terminal manage par TerminalManager
  if (terminalManager) {
    const term = terminalManager.getTerminal(req.params.id);
    if (term && term.status === 'running') {
      if (command === 'message' && params?.content) {
        terminalManager.write(req.params.id, params.content + '\n');
        return res.json({ sent: true, sessionId: req.params.id, command, via: 'terminal-manager' });
      }
      if (command === 'cancel') {
        terminalManager.kill(req.params.id);
        return res.json({ sent: true, sessionId: req.params.id, command, via: 'terminal-manager' });
      }
      // Pour les autres commandes, ecrire directement dans le terminal
      terminalManager.write(req.params.id, `/${command}\n`);
      return res.json({ sent: true, sessionId: req.params.id, command, via: 'terminal-manager' });
    }
  }

  return res.status(404).json({ error: 'Terminal non connecte', sessionId: req.params.id });
});

// Envoyer une commande a TOUS les terminaux connectes (broadcast)
router.post('/broadcast-command', (req, res) => {
  const wsProtocol = req.app.locals.wsProtocol;
  const terminalManager = req.app.locals.terminalManager;
  const { command, params } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });

  // Broadcast via WebSocket
  let count = wsProtocol.broadcastToTerminals('command', { command, params: params || {} });

  // Broadcast aussi aux terminaux manages
  if (terminalManager) {
    for (const term of terminalManager.listTerminals()) {
      if (term.status === 'running') {
        try {
          if (command === 'message' && params?.content) {
            terminalManager.write(term.id, params.content + '\n');
          } else if (command === 'cancel') {
            terminalManager.kill(term.id);
          }
          count++;
        } catch {}
      }
    }
  }

  res.json({ sent: count, command });
});

// Supprimer une session
router.delete('/:id', (req, res) => {
  const tracker = req.app.locals.tracker;
  const session = tracker.removeSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session removed', session });
});

module.exports = router;

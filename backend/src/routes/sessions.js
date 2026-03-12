const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Liste toutes les sessions actives
router.get('/', (req, res) => {
  const tracker = req.app.locals.tracker;
  res.json(tracker.getAllSessions());
});

// Recap consolide de toutes les sessions
router.get('/recap', (req, res) => {
  const tracker = req.app.locals.tracker;
  res.json(tracker.getRecap());
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

// Supprimer une session
router.delete('/:id', (req, res) => {
  const tracker = req.app.locals.tracker;
  const session = tracker.removeSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session removed', session });
});

module.exports = router;

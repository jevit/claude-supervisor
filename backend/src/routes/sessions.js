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

// Supprimer une session
router.delete('/:id', (req, res) => {
  const tracker = req.app.locals.tracker;
  const session = tracker.removeSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session removed', session });
});

module.exports = router;

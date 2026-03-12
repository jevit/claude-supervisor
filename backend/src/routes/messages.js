const express = require('express');
const router = express.Router();

// Liste tous les messages (ou filtres par destinataire)
router.get('/', (req, res) => {
  const messageBus = req.app.locals.messageBus;
  if (req.query.to) {
    const options = { unreadOnly: req.query.unread === 'true' };
    res.json(messageBus.getMessages(req.query.to, options));
  } else {
    const limit = parseInt(req.query.limit, 10) || 100;
    res.json(messageBus.getAllMessages(limit));
  }
});

// Envoyer un message
router.post('/', (req, res) => {
  const messageBus = req.app.locals.messageBus;
  const { from, to, type, content } = req.body;
  if (!to || !content) {
    return res.status(400).json({ error: 'to and content are required' });
  }
  const message = messageBus.send(from || 'system', to, { type, content });
  res.status(201).json(message);
});

// Marquer un message comme lu
router.put('/:id/read', (req, res) => {
  const messageBus = req.app.locals.messageBus;
  const success = messageBus.markRead(req.params.id);
  if (!success) return res.status(404).json({ error: 'Message not found' });
  res.json({ success: true });
});

module.exports = router;

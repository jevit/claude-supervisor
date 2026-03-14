const express = require('express');
const router = express.Router();

// Liste les conflits actifs
router.get('/', (req, res) => {
  const conflictDetector = req.app.locals.conflictDetector;
  res.json(conflictDetector.getConflicts());
});

// Force une nouvelle analyse
router.post('/analyze', (req, res) => {
  const conflictDetector = req.app.locals.conflictDetector;
  const conflicts = conflictDetector.analyze();
  res.json(conflicts);
});

// Notifier les sessions impliquees dans un conflit
router.post('/notify', (req, res) => {
  const messageBus = req.app.locals.messageBus;
  const { sessions, message } = req.body;
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return res.status(400).json({ error: 'sessions array is required' });
  }
  const text = message || 'Conflit détecté sur un fichier que vous modifiez. Veuillez coordonner.';
  let sent = 0;
  for (const sessionId of sessions) {
    try {
      messageBus.send('system', sessionId, text, 'warning');
      sent++;
    } catch {}
  }
  res.json({ sent, total: sessions.length });
});

module.exports = router;

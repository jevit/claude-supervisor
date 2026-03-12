const express = require('express');
const router = express.Router();

// Liste des notifications
router.get('/', (req, res) => {
  const notificationManager = req.app.locals.notificationManager;
  const options = {
    unreadOnly: req.query.unread === 'true',
    limit: parseInt(req.query.limit, 10) || 50,
  };
  res.json(notificationManager.getNotifications(options));
});

// Compteur non-lus
router.get('/count', (req, res) => {
  const notificationManager = req.app.locals.notificationManager;
  res.json({ unread: notificationManager.getUnreadCount() });
});

// Marquer une notification comme lue
router.put('/:id/read', (req, res) => {
  const notificationManager = req.app.locals.notificationManager;
  const success = notificationManager.markRead(req.params.id);
  if (!success) return res.status(404).json({ error: 'Notification not found' });
  res.json({ success: true });
});

// Tout marquer comme lu
router.put('/read-all', (req, res) => {
  const notificationManager = req.app.locals.notificationManager;
  notificationManager.markAllRead();
  res.json({ success: true });
});

// --- Regles d'alertes configurables ---

// Lister les regles
router.get('/rules', (req, res) => {
  const notificationManager = req.app.locals.notificationManager;
  res.json(notificationManager.getRules());
});

// Ajouter/modifier une regle
router.post('/rules', (req, res) => {
  const notificationManager = req.app.locals.notificationManager;
  const { event, severity, titleTemplate, messageTemplate } = req.body;
  if (!event) return res.status(400).json({ error: 'event requis' });
  const rule = notificationManager.addRule(event, { severity, titleTemplate, messageTemplate });
  res.json(rule);
});

// Supprimer une regle
router.delete('/rules/:event', (req, res) => {
  const notificationManager = req.app.locals.notificationManager;
  const success = notificationManager.removeRule(decodeURIComponent(req.params.event));
  if (!success) return res.status(404).json({ error: 'Regle non trouvee' });
  res.json({ success: true });
});

module.exports = router;

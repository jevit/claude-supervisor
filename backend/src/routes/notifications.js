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

module.exports = router;

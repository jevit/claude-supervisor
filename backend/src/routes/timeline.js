const express = require('express');
const router = express.Router();

// Liste des evenements avec filtres optionnels
router.get('/', (req, res) => {
  const eventLog = req.app.locals.eventLog;
  const events = eventLog.getEvents({
    type: req.query.type,
    source: req.query.source,
    limit: req.query.limit,
  });
  res.json(events);
});

// Types d'evenements disponibles (pour les filtres)
router.get('/types', (req, res) => {
  const eventLog = req.app.locals.eventLog;
  res.json(eventLog.getEventTypes());
});

module.exports = router;

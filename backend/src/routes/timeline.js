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

// Sources distinctes (pour le filtre par session/terminal, #31)
// Utilise l'index incrémental de EventLog — O(1) au lieu de O(n)
router.get('/sources', (req, res) => {
  res.json(req.app.locals.eventLog.getSources());
});

module.exports = router;

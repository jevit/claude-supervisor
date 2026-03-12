const express = require('express');
const router = express.Router();

// Toutes les entries de contexte
router.get('/', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  res.json(sharedContext.getAll());
});

// Resume compact
router.get('/summary', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  res.json({ summary: sharedContext.getSummary() });
});

// Ajouter/mettre a jour une entry
router.post('/', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const { key, value, author } = req.body;
  if (!key || !value) {
    return res.status(400).json({ error: 'key and value are required' });
  }
  const entry = sharedContext.add(key, value, author);
  res.status(201).json(entry);
});

// Supprimer une entry
router.delete('/:key', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const removed = sharedContext.remove(req.params.key);
  if (!removed) return res.status(404).json({ error: 'Context entry not found' });
  res.json({ removed: true });
});

module.exports = router;

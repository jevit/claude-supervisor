const express = require('express');
const router = express.Router();

// Liste tous les checks et leurs derniers resultats
router.get('/', (req, res) => {
  const healthChecker = req.app.locals.healthChecker;
  res.json(healthChecker.getResults());
});

// Ajouter un check
router.post('/', (req, res) => {
  const healthChecker = req.app.locals.healthChecker;
  const { name, command, cwd, interval, timeout } = req.body;
  if (!name || !command) {
    return res.status(400).json({ error: 'name and command are required' });
  }
  const check = healthChecker.addCheck({ name, command, cwd, interval, timeout });
  res.status(201).json({ name: check.name, command: check.command, interval: check.interval });
});

// Lancer un check manuellement
router.post('/:name/run', async (req, res) => {
  const healthChecker = req.app.locals.healthChecker;
  try {
    const result = await healthChecker.runCheck(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Supprimer un check
router.delete('/:name', (req, res) => {
  const healthChecker = req.app.locals.healthChecker;
  const removed = healthChecker.removeCheck(req.params.name);
  if (!removed) return res.status(404).json({ error: 'Check not found' });
  res.json({ removed: true });
});

module.exports = router;

const express = require('express');
const router = express.Router();

// Liste des fichiers surveilles
router.get('/watches', (req, res) => {
  const envWatcher = req.app.locals.envWatcher;
  res.json(envWatcher.getWatches());
});

// Ajouter un fichier a surveiller
router.post('/watches', (req, res) => {
  const envWatcher = req.app.locals.envWatcher;
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }
  const added = envWatcher.watch(filePath);
  res.status(201).json({ filePath, added });
});

// Arreter la surveillance d'un fichier
router.delete('/watches', (req, res) => {
  const envWatcher = req.app.locals.envWatcher;
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }
  const removed = envWatcher.unwatch(filePath);
  res.json({ removed });
});

// Historique des changements
router.get('/changes', (req, res) => {
  const envWatcher = req.app.locals.envWatcher;
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json(envWatcher.getChanges(limit));
});

module.exports = router;

const express = require('express');
const router = express.Router();

// File d'attente de commits
router.get('/queue', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  res.json(gitOrchestrator.getQueue());
});

// Ajouter un commit a la file
router.post('/queue', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const { sessionId, directory, message } = req.body;
  if (!directory || !message) {
    return res.status(400).json({ error: 'directory and message are required' });
  }
  const entry = gitOrchestrator.enqueue(sessionId || 'manual', directory, message);
  res.status(201).json(entry);
});

// Marquer un commit comme complete
router.put('/queue/:id/complete', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const entry = gitOrchestrator.complete(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
  res.json(entry);
});

// Annuler un commit
router.delete('/queue/:id', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const cancelled = gitOrchestrator.cancel(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'Queue entry not found' });
  res.json({ cancelled: true });
});

// Branches actives dans un repertoire
router.get('/branches', async (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const { directory } = req.query;
  if (!directory) return res.status(400).json({ error: 'directory query param required' });
  const branches = await gitOrchestrator.getBranches(directory);
  res.json(branches);
});

module.exports = router;

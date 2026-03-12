const express = require('express');
const router = express.Router();

// Statut du mode superviseur
router.get('/status', (req, res) => {
  const supervisorMode = req.app.locals.supervisorMode;
  if (!supervisorMode) return res.status(503).json({ error: 'SupervisorMode non disponible' });
  res.json(supervisorMode.getStatus());
});

// Activer/desactiver le mode
router.post('/toggle', (req, res) => {
  const supervisorMode = req.app.locals.supervisorMode;
  if (!supervisorMode) return res.status(503).json({ error: 'SupervisorMode non disponible' });
  const { enabled } = req.body;
  const result = supervisorMode.setEnabled(enabled !== undefined ? enabled : !supervisorMode.enabled);
  res.json({ enabled: result });
});

// File d'attente de taches
router.get('/queue', (req, res) => {
  const supervisorMode = req.app.locals.supervisorMode;
  if (!supervisorMode) return res.status(503).json({ error: 'SupervisorMode non disponible' });
  res.json(supervisorMode.getQueue());
});

// Ajouter une tache a deleguer
router.post('/queue', (req, res) => {
  const supervisorMode = req.app.locals.supervisorMode;
  if (!supervisorMode) return res.status(503).json({ error: 'SupervisorMode non disponible' });
  const { description, priority, preferredSession } = req.body;
  if (!description) return res.status(400).json({ error: 'description requise' });
  const task = supervisorMode.enqueueTask({ description, priority, preferredSession });
  res.json(task);
});

// Annuler une tache
router.delete('/queue/:id', (req, res) => {
  const supervisorMode = req.app.locals.supervisorMode;
  if (!supervisorMode) return res.status(503).json({ error: 'SupervisorMode non disponible' });
  const success = supervisorMode.cancelTask(req.params.id);
  if (!success) return res.status(404).json({ error: 'Tache non trouvee ou deja deleguee' });
  res.json({ success: true });
});

// Forcer la delegation de toutes les taches en attente
router.post('/delegate-all', (req, res) => {
  const supervisorMode = req.app.locals.supervisorMode;
  if (!supervisorMode) return res.status(503).json({ error: 'SupervisorMode non disponible' });
  const results = supervisorMode.delegateAll();
  res.json({ delegated: results.length, results });
});

// Historique des delegations
router.get('/delegations', (req, res) => {
  const supervisorMode = req.app.locals.supervisorMode;
  if (!supervisorMode) return res.status(503).json({ error: 'SupervisorMode non disponible' });
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json(supervisorMode.getDelegations(limit));
});

module.exports = router;

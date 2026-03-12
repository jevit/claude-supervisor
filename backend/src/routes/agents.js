const express = require('express');
const { v4: uuidv4 } = require('crypto');
const router = express.Router();

// List all agents
router.get('/', (req, res) => {
  const supervisor = req.app.locals.supervisor;
  res.json(supervisor.getAllAgents());
});

// Create a new agent
router.post('/', (req, res) => {
  const supervisor = req.app.locals.supervisor;
  const id = crypto.randomUUID();
  const agent = supervisor.createAgent(id, req.body);
  res.status(201).json(agent);
});

// Get agent by ID
router.get('/:id', (req, res) => {
  const supervisor = req.app.locals.supervisor;
  const agent = supervisor.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Remove agent
router.delete('/:id', (req, res) => {
  const supervisor = req.app.locals.supervisor;
  const agent = supervisor.removeAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({ message: 'Agent removed', agent });
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// List tasks with optional filters
router.get('/', (req, res) => {
  const supervisor = req.app.locals.supervisor;
  const tasks = supervisor.getTasks(req.query);
  res.json(tasks);
});

// Assign a task to an agent
router.post('/', async (req, res) => {
  const supervisor = req.app.locals.supervisor;
  const { agentId, prompt, title } = req.body;

  if (!agentId || !prompt) {
    return res.status(400).json({ error: 'agentId and prompt are required' });
  }

  const task = {
    id: crypto.randomUUID(),
    title: title || prompt.substring(0, 80),
    prompt,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    const result = await supervisor.assignTask(agentId, task);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

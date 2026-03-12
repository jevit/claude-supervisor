const express = require('express');
const router = express.Router();

// Liste tous les locks actifs
router.get('/', (req, res) => {
  const lockManager = req.app.locals.lockManager;
  res.json(lockManager.getLocks());
});

// Liste les conflits (fichiers avec 2+ holders)
router.get('/conflicts', (req, res) => {
  const lockManager = req.app.locals.lockManager;
  res.json(lockManager.getConflicts());
});

// Prendre un lock
router.post('/', (req, res) => {
  const lockManager = req.app.locals.lockManager;
  const { filePath, sessionId } = req.body;
  if (!filePath || !sessionId) {
    return res.status(400).json({ error: 'filePath and sessionId are required' });
  }
  const result = lockManager.acquire(filePath, sessionId);
  res.json(result);
});

// Liberer un lock
router.delete('/', (req, res) => {
  const lockManager = req.app.locals.lockManager;
  const { filePath, sessionId } = req.body;
  if (!filePath || !sessionId) {
    return res.status(400).json({ error: 'filePath and sessionId are required' });
  }
  const released = lockManager.release(filePath, sessionId);
  res.json({ released });
});

module.exports = router;

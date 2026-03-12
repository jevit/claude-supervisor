const express = require('express');
const router = express.Router();

// Liste les conflits actifs
router.get('/', (req, res) => {
  const conflictDetector = req.app.locals.conflictDetector;
  res.json(conflictDetector.getConflicts());
});

// Force une nouvelle analyse
router.post('/analyze', (req, res) => {
  const conflictDetector = req.app.locals.conflictDetector;
  const conflicts = conflictDetector.analyze();
  res.json(conflicts);
});

module.exports = router;

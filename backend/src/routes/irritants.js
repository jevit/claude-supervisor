const express = require('express');
const router = express.Router();

// Liste des irritants connus
router.get('/', (req, res) => {
  const researcher = req.app.locals.irritantResearcher;
  if (!researcher) return res.status(503).json({ error: 'IrritantResearcher non disponible' });
  res.json(researcher.getAll());
});

// Charger les irritants connus (pre-definis)
router.post('/load-known', async (req, res) => {
  const researcher = req.app.locals.irritantResearcher;
  if (!researcher) return res.status(503).json({ error: 'IrritantResearcher non disponible' });
  try {
    const irritants = await researcher.researchKnownIrritants();
    res.json(irritants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lancer une analyse IA des sessions (necessite API Anthropic)
router.post('/analyze', async (req, res) => {
  const researcher = req.app.locals.irritantResearcher;
  const tracker = req.app.locals.tracker;
  if (!researcher) return res.status(503).json({ error: 'IrritantResearcher non disponible' });
  try {
    const sessions = tracker.getAllSessions();
    const irritants = await researcher.analyzeSessionsForIrritants(sessions);
    res.json(irritants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Filtrer par categorie
router.get('/category/:category', (req, res) => {
  const researcher = req.app.locals.irritantResearcher;
  if (!researcher) return res.status(503).json({ error: 'IrritantResearcher non disponible' });
  res.json(researcher.getByCategory(req.params.category));
});

// Irritants a fort impact
router.get('/high-impact', (req, res) => {
  const researcher = req.app.locals.irritantResearcher;
  if (!researcher) return res.status(503).json({ error: 'IrritantResearcher non disponible' });
  const minImpact = parseInt(req.query.min, 10) || 4;
  res.json(researcher.getHighImpact(minImpact));
});

module.exports = router;

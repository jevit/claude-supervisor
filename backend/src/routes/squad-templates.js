const express = require('express');
const router  = express.Router();

// Lister tous les templates
router.get('/', (req, res) => {
  const squadTemplates = req.app.locals.squadTemplates;
  res.json(squadTemplates.getAll());
});

// Sauvegarder un template
router.post('/', (req, res) => {
  const squadTemplates = req.app.locals.squadTemplates;
  const { name, config } = req.body;
  if (!name || !config) return res.status(400).json({ error: 'name et config sont requis' });
  const tpl = squadTemplates.save({ name, config });
  if (!tpl) return res.status(400).json({ error: 'Données invalides' });
  res.status(201).json(tpl);
});

// Restaurer une version antérieure d'un template (#21)
router.post('/:id/restore', (req, res) => {
  const squadTemplates = req.app.locals.squadTemplates;
  const { versionIndex } = req.body;
  if (versionIndex === undefined) return res.status(400).json({ error: 'versionIndex requis' });
  const tpl = squadTemplates.restoreVersion(req.params.id, Number(versionIndex));
  if (!tpl) return res.status(404).json({ error: 'Version introuvable' });
  res.json(tpl);
});

// Supprimer un template
router.delete('/:id', (req, res) => {
  const squadTemplates = req.app.locals.squadTemplates;
  const ok = squadTemplates.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Template introuvable' });
  res.json({ removed: true });
});

module.exports = router;

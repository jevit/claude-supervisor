const express = require('express');
const router = express.Router();

// Toutes les entries (filtrables par namespace)
router.get('/', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const { namespace } = req.query;
  const entries = namespace
    ? sharedContext.getByNamespace(namespace)
    : sharedContext.getAll();
  res.json(entries);
});

// Liste des namespaces avec compte
router.get('/namespaces', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  res.json(sharedContext.getNamespaces());
});

// Résumé compact (pour injection dans les prompts)
router.get('/summary', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  res.json({ summary: sharedContext.getSummary() });
});

// Historique d'une clé
router.get('/:key/history', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const entry = sharedContext.get(decodeURIComponent(req.params.key));
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  res.json(entry.history || []);
});

// Restaurer une version antérieure
router.post('/:key/restore', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const { versionIndex } = req.body;
  if (versionIndex === undefined) return res.status(400).json({ error: 'versionIndex required' });
  const entry = sharedContext.restore(decodeURIComponent(req.params.key), Number(versionIndex));
  if (!entry) return res.status(404).json({ error: 'Version not found' });
  res.json(entry);
});

// Ajouter/mettre à jour une entry
router.post('/', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const { key, value, author } = req.body;
  if (!key || !value) return res.status(400).json({ error: 'key and value are required' });
  // Validation de la clé (#70) : alphanumériques, /, -, _, . uniquement
  if (!/^[a-zA-Z0-9_/.\-]{1,128}$/.test(key)) {
    return res.status(400).json({ error: 'Clé invalide : utilisez uniquement lettres, chiffres, /, -, _, . (max 128 caractères)' });
  }
  const entry = sharedContext.add(key, value, author);
  res.status(201).json(entry);
});

// Supprimer toutes les entries d'un namespace
router.delete('/namespace/:namespace', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const ns = decodeURIComponent(req.params.namespace);
  const entries = sharedContext.getByNamespace(ns);
  entries.forEach((e) => sharedContext.remove(e.key));
  res.json({ removed: entries.length });
});

// Supprimer une entry
router.delete('/:key', (req, res) => {
  const sharedContext = req.app.locals.sharedContext;
  const removed = sharedContext.remove(decodeURIComponent(req.params.key));
  if (!removed) return res.status(404).json({ error: 'Context entry not found' });
  res.json({ removed: true });
});

module.exports = router;

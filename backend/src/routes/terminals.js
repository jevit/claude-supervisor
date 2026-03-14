const express = require('express');
const { runGit, getFullDiff } = require('../services/git-utils');
const router = express.Router();

// Verifier si node-pty est disponible
router.get('/available', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  res.json({ available: terminalManager.isAvailable() });
});

// Liste des terminaux geres
router.get('/', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  res.json(terminalManager.listTerminals());
});

// Lancer un nouveau terminal Claude Code
router.post('/', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  if (!terminalManager.isAvailable()) {
    return res.status(503).json({ error: 'node-pty non disponible' });
  }
  try {
    const { directory, name, prompt, model, dangerousMode, injectContext } = req.body;
    const result = terminalManager.spawn({ directory, name, prompt, model, dangerousMode, injectContext });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Infos d'un terminal
router.get('/:id', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const term = terminalManager.getTerminal(req.params.id);
  if (!term) return res.status(404).json({ error: 'Terminal non trouve' });
  res.json(term);
});

// Recuperer la sortie d'un terminal
router.get('/:id/output', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const lastN = parseInt(req.query.last, 10) || 5000;
  const output = terminalManager.getOutput(req.params.id, lastN);
  if (output === null) return res.status(404).json({ error: 'Terminal non trouve' });
  res.json({ output });
});

// Envoyer du texte dans un terminal
router.post('/:id/write', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'data requis' });
  try {
    terminalManager.write(req.params.id, data);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Redimensionner un terminal
router.post('/:id/resize', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const { cols, rows } = req.body;
  const success = terminalManager.resize(req.params.id, cols || 120, rows || 40);
  if (!success) return res.status(404).json({ error: 'Terminal non trouve ou arrete' });
  res.json({ success: true });
});

// Nettoyer les terminaux termines
// Reprendre une session fantome (ghost)
router.post('/:id/resume', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  if (!terminalManager.isAvailable()) {
    return res.status(503).json({ error: 'node-pty non disponible' });
  }
  try {
    const result = terminalManager.resume(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/cleanup', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const tracker = req.app.locals.tracker;
  const before = terminalManager.listTerminals().length;
  // Supprimer aussi les sessions correspondantes
  for (const term of terminalManager.listTerminals()) {
    if (term.status !== 'running') {
      tracker.removeSession(term.id);
    }
  }
  terminalManager.cleanup();
  const after = terminalManager.listTerminals().length;
  res.json({ removed: before - after });
});

// Renommer un terminal
router.patch('/:id', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name requis' });
  const success = terminalManager.rename(req.params.id, name.trim());
  if (!success) return res.status(404).json({ error: 'Terminal non trouve' });
  res.json({ success: true, name: name.trim() });
});

// Arreter un terminal
router.delete('/:id', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const success = terminalManager.kill(req.params.id);
  if (!success) return res.status(404).json({ error: 'Terminal non trouve' });
  res.json({ success: true });
});

// Git diff pour un terminal specifique
router.get('/:id/diff', async (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const term = terminalManager.getTerminal(req.params.id);
  if (!term) return res.status(404).json({ error: 'Terminal non trouve' });
  try {
    const result = await getFullDiff(term.directory);
    res.json({ ...result, directory: term.directory });
  } catch (err) {
    if (err.message?.includes('not a git repository') || err.stderr?.includes('not a git repository')) {
      return res.status(400).json({ error: 'Pas un depot git', directory: term.directory });
    }
    res.status(500).json({ error: err.message });
  }
});

// Git diff pour un fichier specifique d'un terminal
router.get('/:id/diff/:file(*)', async (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const term = terminalManager.getTerminal(req.params.id);
  if (!term) return res.status(404).json({ error: 'Terminal non trouve' });
  try {
    let diff = await runGit(['diff', 'HEAD', '--', req.params.file], term.directory);
    if (!diff) diff = await runGit(['diff', '--cached', '--', req.params.file], term.directory);
    res.json({ file: req.params.file, diff });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

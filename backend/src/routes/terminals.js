const express = require('express');
const fs = require('fs');
const path = require('path');
const { runGit, getFullDiff } = require('../services/git-utils');
const router = express.Router();

// Rate limiting simple sur le spawn (#47) — max 10 créations par minute
const spawnHistory = [];
function isRateLimited() {
  const now = Date.now();
  while (spawnHistory.length && now - spawnHistory[0] > 60000) spawnHistory.shift();
  if (spawnHistory.length >= 10) return true;
  spawnHistory.push(now);
  return false;
}

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

/**
 * Vérifie qu'un chemin normalisé est dans l'un des répertoires de travail
 * des terminaux actifs. Protège contre le path traversal.
 */
function _isAllowedPath(normalized, terminalManager) {
  const dirs = (terminalManager?.listTerminals() || [])
    .map((t) => t.directory)
    .filter(Boolean)
    .map((d) => path.normalize(d));
  const norm = normalized.toLowerCase();
  return dirs.some((d) => norm.startsWith(d.toLowerCase()));
}

// Parcourir le système de fichiers — liste un répertoire ou les lecteurs racine
router.get('/fs', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const reqPath = req.query.path || '';

  // Sans path : lister les lecteurs disponibles (Windows) ou racine (Unix)
  if (!reqPath) {
    if (process.platform === 'win32') {
      const drives = [];
      for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
        const p = `${letter}:\\`;
        try { fs.accessSync(p); drives.push({ name: `${letter}:`, type: 'dir', path: p }); } catch {}
      }
      return res.json({ path: '', parent: null, entries: drives });
    }
    return res.json({ path: '/', parent: null, entries: _listDir('/') });
  }

  try {
    const normalized = path.normalize(reqPath);
    if (!_isAllowedPath(normalized, terminalManager)) {
      return res.status(403).json({ error: 'Accès refusé : chemin hors répertoires de travail' });
    }
    const parent = path.dirname(normalized);
    res.json({
      path: normalized,
      parent: parent !== normalized ? parent : null,
      entries: _listDir(normalized),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Lire le contenu d'un fichier (max 200 Ko)
// POST pour que le chemin absolu ne soit pas logué dans les access logs HTTP
router.post('/fs/read', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const filePath = req.body?.path;
  if (!filePath) return res.status(400).json({ error: 'path requis' });
  try {
    const normalized = path.normalize(filePath);
    if (!_isAllowedPath(normalized, terminalManager)) {
      return res.status(403).json({ error: 'Accès refusé : chemin hors répertoires de travail' });
    }
    const stat = fs.statSync(normalized);
    if (!stat.isFile()) return res.status(400).json({ error: 'Ce chemin n\'est pas un fichier' });
    if (stat.size > 200 * 1024) return res.status(413).json({ error: `Fichier trop volumineux (${Math.round(stat.size / 1024)} Ko > 200 Ko)` });
    const content = fs.readFileSync(normalized, 'utf-8');
    res.json({ path: normalized, content, size: stat.size, mtime: stat.mtime });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function _listDir(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      path: path.join(dirPath, e.name),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

// Valider un chemin de répertoire (#20)
router.post('/validate-path', (req, res) => {
  const { path: dirPath } = req.body;
  if (!dirPath) return res.status(400).json({ valid: false, error: 'path requis' });
  const exists = fs.existsSync(dirPath);
  const isDir  = exists && fs.statSync(dirPath).isDirectory();
  res.json({ valid: isDir, exists, isDirectory: isDir });
});

// Lancer un nouveau terminal Claude Code
router.post('/', (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  if (!terminalManager.isAvailable()) {
    return res.status(503).json({ error: 'node-pty non disponible — exécutez : cd backend && npm rebuild node-pty' });
  }
  if (isRateLimited()) {
    return res.status(429).json({ error: 'Trop de terminaux créés rapidement (max 10/min)' });
  }
  try {
    const { directory, name, prompt, model, dangerousMode, injectContext, resumeSessionId } = req.body;
    const result = terminalManager.spawn({ directory, name, prompt, model, dangerousMode, injectContext, resumeSessionId });
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

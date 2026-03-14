const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
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

// --- Utilitaire interne pour executer git dans un repertoire ---
async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    // Si git retourne un code non-zero mais a quand meme une sortie
    if (err.stdout !== undefined) return err.stdout;
    throw err;
  }
}

// Parser la sortie de git status --porcelain
function parseStatus(raw) {
  const files = [];
  const summary = { modified: 0, added: 0, deleted: 0, untracked: 0 };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const xy = line.substring(0, 2);
    const filePath = line.substring(3);
    let status = 'modified';
    if (xy.includes('?')) { status = 'untracked'; summary.untracked++; }
    else if (xy.includes('A')) { status = 'added'; summary.added++; }
    else if (xy.includes('D')) { status = 'deleted'; summary.deleted++; }
    else { summary.modified++; }
    files.push({ path: filePath, status });
  }
  return { files, summary };
}

// Obtenir le diff complet d'un repertoire
async function getFullDiff(directory) {
  const [statusRaw, diffUnstaged, diffStaged] = await Promise.all([
    runGit(['status', '--porcelain'], directory),
    runGit(['diff'], directory),
    runGit(['diff', '--cached'], directory),
  ]);
  const { files, summary } = parseStatus(statusRaw);

  // Combiner les diffs
  const combinedDiff = [diffUnstaged, diffStaged].filter(Boolean).join('\n');

  // Attacher le diff individuel a chaque fichier
  for (const f of files) {
    try {
      if (f.status === 'untracked') {
        f.diff = await runGit(['diff', '--no-index', 'NUL', f.path], directory).catch(() => '');
      } else {
        const fileDiff = await runGit(['diff', 'HEAD', '--', f.path], directory);
        f.diff = fileDiff || await runGit(['diff', '--cached', '--', f.path], directory);
      }
    } catch {
      f.diff = '';
    }
  }

  // Derniers commits pour contexte (branch, historique)
  let recentCommits = [];
  let currentBranch = '';
  try {
    const logRaw = await runGit(['log', '--oneline', '-10', '--decorate'], directory);
    recentCommits = logRaw.split('\n').filter(Boolean).map((line) => {
      const [hash, ...rest] = line.split(' ');
      return { hash, message: rest.join(' ') };
    });
    currentBranch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], directory)).trim();
  } catch {}

  return { files, summary, combinedDiff, recentCommits, currentBranch };
}

// Git diff pour un terminal specifique
router.get('/:id/diff', async (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const term = terminalManager.getTerminal(req.params.id);
  if (!term) return res.status(404).json({ error: 'Terminal non trouve' });
  try {
    const result = await getFullDiff(term.directory);
    res.json(result);
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

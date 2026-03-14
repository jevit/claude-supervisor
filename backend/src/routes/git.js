const express = require('express');
const { runGit, parseGitStatus } = require('../services/git-utils');
const router = express.Router();

// Diff generique pour n'importe quel repertoire
router.post('/diff', async (req, res) => {
  const { directory, commitHash } = req.body;
  if (!directory) return res.status(400).json({ error: 'directory requis' });

  // Si un hash de commit est fourni, retourner le diff de ce commit uniquement
  if (commitHash) {
    try {
      const commitDiff = await runGit(['show', '--stat', '--patch', commitHash], directory);
      return res.json({ commitDiff });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  try {
    const [statusRaw, diffUnstaged, diffStaged] = await Promise.all([
      runGit(['status', '--porcelain'], directory),
      runGit(['diff'], directory),
      runGit(['diff', '--cached'], directory),
    ]);
    const { files, summary } = parseGitStatus(statusRaw);
    const combinedDiff = [diffUnstaged, diffStaged].filter(Boolean).join('\n');
    // Diff individuel par fichier
    for (const f of files) {
      try {
        if (f.status === 'untracked') {
          // /dev/null ne fonctionne pas sur Windows — afficher le contenu du fichier
          try {
            f.diff = await runGit(['diff', '--no-index', 'NUL', f.path], directory);
          } catch {
            f.diff = await runGit(['show', `:${f.path}`], directory).catch(() => '');
          }
        } else {
          f.diff = await runGit(['diff', 'HEAD', '--', f.path], directory);
          if (!f.diff) f.diff = await runGit(['diff', '--cached', '--', f.path], directory);
        }
      } catch { f.diff = ''; }
    }
    // Derniers commits pour contexte (affichés même si working tree propre)
    let recentCommits = [];
    try {
      const logRaw = await runGit(['log', '--oneline', '-8', '--decorate'], directory);
      recentCommits = logRaw.split('\n').filter(Boolean).map((line) => {
        const [hash, ...rest] = line.split(' ');
        return { hash, message: rest.join(' ') };
      });
    } catch {}
    res.json({ files, summary, combinedDiff, recentCommits });
  } catch (err) {
    if (err.message?.includes('not a git repository') || err.stderr?.includes('not a git repository')) {
      return res.status(400).json({ error: 'Pas un depot git', directory });
    }
    res.status(500).json({ error: err.message });
  }
});

// Stage un fichier
router.post('/stage', async (req, res) => {
  const { directory, filePath } = req.body;
  if (!directory || !filePath) return res.status(400).json({ error: 'directory and filePath required' });
  try {
    await runGit(['add', '--', filePath], directory);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stage tous les fichiers modifies
router.post('/stage-all', async (req, res) => {
  const { directory } = req.body;
  if (!directory) return res.status(400).json({ error: 'directory required' });
  try {
    await runGit(['add', '-A'], directory);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Unstage un fichier
router.post('/unstage', async (req, res) => {
  const { directory, filePath } = req.body;
  if (!directory || !filePath) return res.status(400).json({ error: 'directory and filePath required' });
  try {
    await runGit(['restore', '--staged', '--', filePath], directory);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Discard les modifications d'un fichier (working tree)
router.post('/discard', async (req, res) => {
  const { directory, filePath, untracked } = req.body;
  if (!directory || !filePath) return res.status(400).json({ error: 'directory and filePath required' });
  try {
    if (untracked) {
      await runGit(['clean', '-f', '--', filePath], directory);
    } else {
      await runGit(['restore', '--', filePath], directory);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Commit les fichiers stages
router.post('/commit', async (req, res) => {
  const { directory, message } = req.body;
  if (!directory || !message) return res.status(400).json({ error: 'directory and message required' });
  try {
    const out = await runGit(['commit', '-m', message], directory);
    res.json({ success: true, output: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Vue globale : fichiers modifies dans tous les terminaux actifs
router.get('/all-changes', async (req, res) => {
  const terminalManager = req.app.locals.terminalManager;
  const terminals = (terminalManager?.listTerminals() || [])
    .filter((t) => t.status === 'running' && t.directory);

  const results = await Promise.allSettled(
    terminals.map(async (t) => {
      const { files, summary, currentBranch } = await getFullDiff(t.directory);
      // Ne garder que les champs utiles (pas les diffs complets pour alléger)
      return {
        id: t.id,
        name: t.name || t.id.substring(0, 8),
        directory: t.directory,
        currentBranch,
        summary,
        files: files.map(({ path, status }) => ({ path, status })),
      };
    })
  );

  const terminalData = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { id: terminals[i].id, name: terminals[i].name, directory: terminals[i].directory, files: [], summary: {}, error: r.reason?.message }
  );

  // Fichiers touches par plusieurs terminaux (clé = chemin absolu)
  const fileIndex = new Map();
  for (const t of terminalData) {
    for (const f of t.files || []) {
      // Cle = repertoire + chemin relatif pour avoir l'absolu
      const absKey = `${t.directory.replace(/\\/g, '/')}/${f.path}`;
      if (!fileIndex.has(absKey)) {
        fileIndex.set(absKey, { path: f.path, directory: t.directory, status: f.status, sessions: [] });
      }
      fileIndex.get(absKey).sessions.push({ id: t.id, name: t.name });
    }
  }

  // Trier : d'abord les fichiers multi-sessions (conflits potentiels), puis par path
  const hotFiles = Array.from(fileIndex.values())
    .sort((a, b) => b.sessions.length - a.sessions.length || a.path.localeCompare(b.path));

  res.json({ terminals: terminalData, hotFiles });
});

// File d'attente de commits
router.get('/queue', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  res.json(gitOrchestrator.getQueue());
});

// Ajouter un commit a la file
router.post('/queue', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const { sessionId, directory, message } = req.body;
  if (!directory || !message) {
    return res.status(400).json({ error: 'directory and message are required' });
  }
  const entry = gitOrchestrator.enqueue(sessionId || 'manual', directory, message);
  res.status(201).json(entry);
});

// Marquer un commit comme complete
router.put('/queue/:id/complete', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const entry = gitOrchestrator.complete(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
  res.json(entry);
});

// Annuler un commit
router.delete('/queue/:id', (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const cancelled = gitOrchestrator.cancel(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'Queue entry not found' });
  res.json({ cancelled: true });
});

// Branches actives dans un repertoire
router.get('/branches', async (req, res) => {
  const gitOrchestrator = req.app.locals.gitOrchestrator;
  const { directory } = req.query;
  if (!directory) return res.status(400).json({ error: 'directory query param required' });
  const branches = await gitOrchestrator.getBranches(directory);
  res.json(branches);
});

module.exports = router;

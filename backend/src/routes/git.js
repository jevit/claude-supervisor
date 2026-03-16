const express = require('express');
const { runGit, runGitStrict, parseGitStatus, getFullDiff } = require('../services/git-utils');
const router = express.Router();

// Cache du diff git (#53) — invalidé par file:activity via broadcast
const DIFF_CACHE_TTL = 5000; // 5s
const diffCache = new Map(); // key → { result, timestamp }

// Invalider le cache quand un fichier est modifié (appelé depuis broadcast)
router.invalidateDiffCache = (directory) => {
  if (!directory) { diffCache.clear(); return; }
  const norm = directory.replace(/\\/g, '/').toLowerCase();
  for (const key of diffCache.keys()) {
    if (key.includes(norm)) diffCache.delete(key);
  }
};

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
  // Vérifier le cache (#53)
  const cacheKey = `dir:${directory}`;
  const cached = diffCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DIFF_CACHE_TTL) {
    return res.json(cached.result);
  }
  try {
    const result = await getFullDiff(directory);
    diffCache.set(cacheKey, { result, timestamp: Date.now() });
    res.json(result);
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
    await runGitStrict(['add', '-A'], directory);
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
    const out = await runGitStrict(['commit', '-m', message], directory);
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

// Historique git log (#82) — 20 derniers commits
router.get('/log', async (req, res) => {
  const { directory } = req.query;
  if (!directory) return res.status(400).json({ error: 'directory query param required' });
  try {
    const out = await runGit(
      ['log', '--oneline', '--no-merges', '-20', '--format=%H|%h|%s|%an|%ad', '--date=relative'],
      directory
    );
    const commits = out.trim().split('\n').filter(Boolean).map((line) => {
      const [hash, short, subject, author, date] = line.split('|');
      return { hash, short, subject, author, date };
    });
    res.json(commits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Push vers le remote
router.post('/push', async (req, res) => {
  const { directory } = req.body;
  if (!directory) return res.status(400).json({ error: 'directory required' });
  try {
    const out = await runGitStrict(['push'], directory);
    res.json({ success: true, output: out });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

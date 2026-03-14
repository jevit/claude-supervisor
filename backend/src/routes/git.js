const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const router = express.Router();

// --- Utilitaire pour executer git dans un repertoire ---
async function runGitCmd(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    if (err.stdout !== undefined) return err.stdout;
    throw err;
  }
}

function parseGitStatus(raw) {
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

// Diff generique pour n'importe quel repertoire
router.post('/diff', async (req, res) => {
  const { directory, commitHash } = req.body;
  if (!directory) return res.status(400).json({ error: 'directory requis' });

  // Si un hash de commit est fourni, retourner le diff de ce commit uniquement
  if (commitHash) {
    try {
      const commitDiff = await runGitCmd(['show', '--stat', '--patch', commitHash], directory);
      return res.json({ commitDiff });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  try {
    const [statusRaw, diffUnstaged, diffStaged] = await Promise.all([
      runGitCmd(['status', '--porcelain'], directory),
      runGitCmd(['diff'], directory),
      runGitCmd(['diff', '--cached'], directory),
    ]);
    const { files, summary } = parseGitStatus(statusRaw);
    const combinedDiff = [diffUnstaged, diffStaged].filter(Boolean).join('\n');
    // Diff individuel par fichier
    for (const f of files) {
      try {
        if (f.status === 'untracked') {
          // /dev/null ne fonctionne pas sur Windows — afficher le contenu du fichier
          try {
            f.diff = await runGitCmd(['diff', '--no-index', 'NUL', f.path], directory);
          } catch {
            f.diff = await runGitCmd(['show', `:${f.path}`], directory).catch(() => '');
          }
        } else {
          f.diff = await runGitCmd(['diff', 'HEAD', '--', f.path], directory);
          if (!f.diff) f.diff = await runGitCmd(['diff', '--cached', '--', f.path], directory);
        }
      } catch { f.diff = ''; }
    }
    // Derniers commits pour contexte (affichés même si working tree propre)
    let recentCommits = [];
    try {
      const logRaw = await runGitCmd(['log', '--oneline', '-8', '--decorate'], directory);
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

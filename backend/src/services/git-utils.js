const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const os = require('os');
const execFileAsync = promisify(execFile);

const DEV_NULL = os.platform() === 'win32' ? 'NUL' : '/dev/null';

/**
 * Utilitaires Git partagés entre les routes terminals et git.
 */

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    if (err.stdout !== undefined) return err.stdout;
    throw err;
  }
}

// Variante stricte : throw si exit code != 0, expose stderr dans l'erreur
async function runGitStrict(args, cwd) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || 'Erreur git inconnue').trim();
    throw new Error(msg);
  }
}

function parseGitStatus(raw) {
  const files = [];
  const summary = { modified: 0, added: 0, deleted: 0, untracked: 0 };
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const x = line[0]; // etat index (staged)
    const y = line[1]; // etat working tree (unstaged)
    const filePath = line.substring(3);
    let status = 'modified';
    if (x === '?' && y === '?') { status = 'untracked'; summary.untracked++; }
    else if (x === 'A' || y === 'A') { status = 'added'; summary.added++; }
    else if (x === 'D' || y === 'D') { status = 'deleted'; summary.deleted++; }
    else { summary.modified++; }
    // staged = changement dans l'index (X != espace/?)
    // unstaged = changement dans le working tree (Y != espace/?)
    const staged   = x !== ' ' && x !== '?';
    const unstaged = y !== ' ' && y !== '?';
    files.push({ path: filePath, status, staged, unstaged });
  }
  return { files, summary };
}


async function getFullDiff(directory) {
  // 3 appels parallèles légers — plus de diff complet ici (lazy-load via /file-diff)
  const [statusRaw, logRaw, branchRaw] = await Promise.all([
    runGit(['status', '--porcelain'], directory),
    runGit(['log', '--oneline', '-10', '--decorate'], directory).catch(() => ''),
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], directory).catch(() => ''),
  ]);

  const { files, summary } = parseGitStatus(statusRaw);

  // Chemin absolu pour chaque fichier (path.join → natif OS)
  for (const f of files) f.absPath = path.join(directory, f.path);

  const recentCommits = logRaw.split('\n').filter(Boolean).map((line) => {
    const [hash, ...rest] = line.split(' ');
    return { hash, message: rest.join(' ') };
  });
  const currentBranch = branchRaw.trim();

  return { files, summary, recentCommits, currentBranch };
}

/**
 * Diff d'un seul fichier — utilisé pour le lazy-load frontend.
 */
async function getFileDiff(directory, filePath, status) {
  if (status === 'untracked') {
    return runGit(['diff', '--no-index', DEV_NULL, filePath], directory).catch(() => '');
  }
  const diff = await runGit(['diff', 'HEAD', '--', filePath], directory);
  if (diff) return diff;
  return runGit(['diff', '--cached', '--', filePath], directory);
}

module.exports = { runGit, runGitStrict, parseGitStatus, getFullDiff, getFileDiff };

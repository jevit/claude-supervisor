const { execFile } = require('child_process');
const { promisify } = require('util');
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
  const [statusRaw, diffUnstaged, diffStaged] = await Promise.all([
    runGit(['status', '--porcelain'], directory),
    runGit(['diff'], directory),
    runGit(['diff', '--cached'], directory),
  ]);
  const { files, summary } = parseGitStatus(statusRaw);
  const combinedDiff = [diffUnstaged, diffStaged].filter(Boolean).join('\n');

  for (const f of files) {
    try {
      if (f.status === 'untracked') {
        // NUL (Windows) et /dev/null (Unix) pour diff --no-index
        f.diff = await runGit(['diff', '--no-index', DEV_NULL, f.path], directory).catch(() => '');
      } else {
        f.diff = await runGit(['diff', 'HEAD', '--', f.path], directory);
        if (!f.diff) f.diff = await runGit(['diff', '--cached', '--', f.path], directory);
      }
    } catch {
      f.diff = '';
    }
  }

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

module.exports = { runGit, runGitStrict, parseGitStatus, getFullDiff };

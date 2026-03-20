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

/**
 * Découpe un diff unifié brut en Map<cheminFichier, diffTexte>.
 * Évite N appels git individuels — on parse la sortie déjà récupérée.
 */
function parseDiffByFile(rawDiff) {
  const result = new Map();
  if (!rawDiff) return result;
  // Découpe sur chaque "diff --git" sans perdre la ligne elle-même
  const sections = rawDiff.split(/\n(?=diff --git )/);
  for (const section of sections) {
    if (!section.startsWith('diff --git ')) continue;
    // Extrait le chemin b/ (chemin après renommage éventuel)
    const m = section.match(/^diff --git a\/.+ b\/(.+)\n/);
    if (m) result.set(m[1].replace(/\\/g, '/'), section);
  }
  return result;
}

async function getFullDiff(directory) {
  // 3 appels parallèles au lieu de 3 + N séquentiels
  const [statusRaw, diffHead, diffCached] = await Promise.all([
    runGit(['status', '--porcelain'], directory),
    // diff HEAD couvre staged + unstaged sur les fichiers trackés
    runGit(['diff', 'HEAD'], directory).catch(() => runGit(['diff'], directory)),
    // diff --cached seul pour les nouveaux fichiers stagés sans commit précédent
    runGit(['diff', '--cached'], directory),
  ]);
  const { files, summary } = parseGitStatus(statusRaw);
  const combinedDiff = [diffHead, diffCached].filter(Boolean).join('\n');

  // Assigner les diffs trackés depuis le diff global parsé (0 appel supplémentaire)
  const diffByFile = parseDiffByFile(combinedDiff);
  const untrackedFiles = [];
  for (const f of files) {
    if (f.status === 'untracked') {
      untrackedFiles.push(f);
      f.diff = ''; // sera rempli en parallèle ci-dessous
    } else {
      f.diff = diffByFile.get(f.path.replace(/\\/g, '/')) || '';
    }
  }

  // Diffs des fichiers non-trackés en parallèle (diff --no-index vers /dev/null)
  await Promise.all(untrackedFiles.map(async (f) => {
    f.diff = await runGit(['diff', '--no-index', DEV_NULL, f.path], directory).catch(() => '');
  }));

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

const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * WorktreeManager - Gestion des git worktrees pour l'isolation des agents.
 *
 * Chaque membre d'un squad peut travailler dans son propre worktree
 * (branche + repertoire isoles), evitant les conflits de fichiers.
 *
 * Structure sur disque :
 *   <worktreesDir>/
 *     <squadId>-<safeName>/   <- worktree d'un membre
 *     <squadId>-<safeName>/   <- worktree d'un autre membre
 */
class WorktreeManager {
  /**
   * @param {string} repoRoot     - Racine du depot git (ex: C:/Perso/Workspace3/claude-supervisor)
   * @param {string} worktreesDir - Dossier cible des worktrees (ex: C:/Perso/Workspace3/cs-worktrees)
   */
  constructor(repoRoot, worktreesDir) {
    this.repoRoot    = repoRoot;
    this.worktreesDir = worktreesDir;
  }

  /**
   * Creer un nouveau worktree sur une nouvelle branche.
   * @param {string} branchName  - Nom de branche (ex: squad/abc123/agent-api)
   * @param {string} [subfolder] - Sous-dossier optionnel dans worktreesDir
   * @returns {string} Chemin absolu du worktree cree
   */
  create(branchName, subfolder = null) {
    // Securiser le nom pour le systeme de fichiers
    const safeName = (subfolder || branchName).replace(/[\/\\:*?"<>|]/g, '-').replace(/-+/g, '-');
    const wtPath = path.join(this.worktreesDir, safeName);

    if (!fs.existsSync(this.worktreesDir)) {
      fs.mkdirSync(this.worktreesDir, { recursive: true });
    }

    if (fs.existsSync(wtPath)) {
      // Worktree deja existant : le retourner tel quel
      return wtPath;
    }

    execFileSync('git', ['worktree', 'add', wtPath, '-b', branchName], {
      cwd: this.repoRoot,
      stdio: 'pipe',
    });

    return wtPath;
  }

  /**
   * Supprimer un worktree et sa branche associee.
   * @param {string} worktreePath - Chemin absolu du worktree
   * @param {string} [branch]     - Branche a supprimer apres le worktree
   */
  remove(worktreePath, branch = null) {
    try {
      execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });
    } catch (err) {
      console.warn(`WorktreeManager: echec worktree remove ${worktreePath}: ${err.message}`);
    }

    // Supprimer aussi le dossier si git ne l'a pas fait
    try {
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    } catch {}

    // Supprimer la branche locale
    if (branch) {
      try {
        execFileSync('git', ['branch', '-D', branch], {
          cwd: this.repoRoot,
          stdio: 'pipe',
        });
      } catch (err) {
        console.warn(`WorktreeManager: echec branch -D ${branch}: ${err.message}`);
      }
    }

    this.prune();
  }

  /**
   * Lister tous les worktrees actifs.
   * @returns {Array<{path: string, branch: string, head: string, bare: boolean}>}
   */
  list() {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: this.repoRoot,
        encoding: 'utf-8',
      });

      const worktrees = [];
      let current = {};

      for (const line of output.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current);
          current = { path: line.slice(9).trim(), branch: null, head: null, bare: false };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice(5).trim();
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).trim().replace('refs/heads/', '');
        } else if (line === 'bare') {
          current.bare = true;
        }
      }
      if (current.path) worktrees.push(current);

      return worktrees;
    } catch {
      return [];
    }
  }

  /**
   * Nettoyer les worktrees obsoletes (dossiers supprimes manuellement).
   */
  prune() {
    try {
      execSync('git worktree prune', {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });
    } catch {}
  }

  /**
   * Verifier si le repertoire courant est un depot git valide.
   */
  isGitRepo() {
    try {
      execSync('git rev-parse --git-dir', { cwd: this.repoRoot, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { WorktreeManager };

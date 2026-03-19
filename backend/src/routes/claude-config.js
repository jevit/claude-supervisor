const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

// Racine du projet supervisor (3 niveaux au-dessus de routes/)
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
// Répertoire .claude utilisateur (~/.claude)
const USER_CLAUDE_DIR = path.join(os.homedir(), '.claude');

// Convertit un chemin absolu en identifiant de projet Claude
// Format Claude Code : C:/Perso/Workspace3 → C--Perso-Workspace3
function pathToProjectId(absPath) {
  return absPath
    .replace(/\\/g, '/')      // backslashes → slashes
    .replace(':/', '--')       // C:/ → C--
    .replace(/\//g, '-');     // /foo/bar → -foo-bar
}

// Trouve les répertoires de projet Claude correspondant au chemin (exact + parents)
function findProjectDirs(absPath) {
  const found = [];
  let current = absPath.replace(/\\/g, '/');
  while (current.length > 3) {
    const id  = pathToProjectId(current);
    const dir = path.join(USER_CLAUDE_DIR, 'projects', id);
    if (fs.existsSync(dir)) found.push({ id, dir });
    const lastSlash = current.lastIndexOf('/');
    if (lastSlash <= 2) break;
    current = current.substring(0, lastSlash);
  }
  return found;
}

// Lit et parse un fichier JSON, retourne null si absent ou invalide
function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// Lit un fichier texte, retourne null si absent
function readText(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// Cherche tous les CLAUDE.md dans l'arborescence du projet (max 3 niveaux)
function findClaudeMd(dir, depth = 0) {
  const results = [];
  if (depth > 3) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === 'CLAUDE.md') {
        results.push(full);
      } else if (entry.isDirectory() && depth < 3) {
        results.push(...findClaudeMd(full, depth + 1));
      }
    }
  } catch {}
  return results;
}

// Lit les stats d'activité : les N dernières entrées (peu importe la date)
function readStats(lastN = 30) {
  const data = readJson(path.join(USER_CLAUDE_DIR, 'stats-cache.json'));
  if (!data?.dailyActivity) return null;

  const activity = [...data.dailyActivity]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-lastN);

  const totals = activity.reduce(
    (acc, d) => ({
      messages: acc.messages + (d.messageCount || 0),
      sessions: acc.sessions + (d.sessionCount || 0),
      toolCalls: acc.toolCalls + (d.toolCallCount || 0),
    }),
    { messages: 0, sessions: 0, toolCalls: 0 }
  );

  return { activity, totals, lastComputedDate: data.lastComputedDate };
}

// Lit les fichiers mémoire de tous les répertoires de projet trouvés
function readProjectMemory(projectDirs) {
  const seen = new Set();
  const results = [];
  for (const { id, dir } of projectDirs) {
    const memDir = path.join(dir, 'memory');
    if (!fs.existsSync(memDir)) continue;
    try {
      fs.readdirSync(memDir)
        .filter((f) => f.endsWith('.md'))
        .forEach((f) => {
          const key = `${id}/${f}`;
          if (seen.has(key)) return;
          seen.add(key);
          const stat = fs.statSync(path.join(memDir, f));
          results.push({
            file: f,
            projectId: id,
            content: readText(path.join(memDir, f)),
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
          });
        });
    } catch {}
  }
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// Lit les plans disponibles (~/.claude/plans/)
function readPlans() {
  const plansDir = path.join(USER_CLAUDE_DIR, 'plans');
  if (!fs.existsSync(plansDir)) return [];
  try {
    return fs.readdirSync(plansDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const stat = fs.statSync(path.join(plansDir, f));
        const content = readText(path.join(plansDir, f));
        // Extraire le titre H1 s'il existe
        const titleMatch = content?.match(/^#\s+(.+)$/m);
        return {
          file: f,
          title: titleMatch ? titleMatch[1] : f.replace('.md', ''),
          content,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

// Lit les todos des sessions de tous les répertoires de projet (non-completed seulement)
function readProjectTodos(projectDirs) {
  const todosDir = path.join(USER_CLAUDE_DIR, 'todos');
  if (!fs.existsSync(todosDir)) return [];

  // Collecter tous les session IDs des répertoires de projet trouvés
  const sessionIds = new Set();
  for (const { dir } of projectDirs) {
    try {
      fs.readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .forEach((f) => sessionIds.add(f.replace('.jsonl', '')));
    } catch {}
  }

  if (sessionIds.size === 0) return [];

  const results = [];
  for (const sessionId of sessionIds) {
    const candidates = [
      path.join(todosDir, `${sessionId}-agent-${sessionId}.json`),
      path.join(todosDir, `${sessionId}.json`),
    ];
    for (const f of candidates) {
      if (!fs.existsSync(f)) continue;
      try {
        const todos = readJson(f);
        if (!Array.isArray(todos) || todos.length === 0) continue;
        const pending = todos.filter((t) => t.status !== 'completed');
        if (pending.length > 0) {
          results.push({ sessionId, todos, pending: pending.length });
        }
      } catch {}
    }
  }

  return results.sort((a, b) => b.pending - a.pending);
}

// GET /api/claude-config — agrège toute la config Claude
router.get('/', (req, res) => {
  const projectDirs = findProjectDirs(PROJECT_ROOT);
  const projectId   = projectDirs[0]?.id || pathToProjectId(PROJECT_ROOT);

  // Settings projet (.claude/settings.json)
  const projectSettings = readJson(path.join(PROJECT_ROOT, '.claude', 'settings.json'));

  // Settings utilisateur (~/.claude/settings.json)
  const userSettings = readJson(path.join(USER_CLAUDE_DIR, 'settings.json'));

  // Settings locaux utilisateur (~/.claude/settings.local.json)
  const userLocalSettings = readJson(path.join(USER_CLAUDE_DIR, 'settings.local.json'));

  // Permissions consolidées (projet + user + local)
  const permissions = {
    allow: [
      ...((projectSettings?.permissions?.allow) || []),
      ...((userSettings?.permissions?.allow) || []),
      ...((userLocalSettings?.permissions?.allow) || []),
    ],
    deny: [
      ...((projectSettings?.permissions?.deny) || []),
      ...((userSettings?.permissions?.deny) || []),
      ...((userLocalSettings?.permissions?.deny) || []),
    ],
  };

  // MCP servers (~/.claude/mcp.json)
  const mcpConfig = readJson(path.join(USER_CLAUDE_DIR, 'mcp.json'));

  // MCP auth cache (~/.claude/mcp-needs-auth-cache.json)
  const mcpAuthCache = readJson(path.join(USER_CLAUDE_DIR, 'mcp-needs-auth-cache.json'));

  // CLAUDE.md projet + user
  const claudeMdFiles = findClaudeMd(PROJECT_ROOT).map((filePath) => ({
    path: filePath.replace(PROJECT_ROOT, '').replace(/\\/g, '/') || '/',
    content: readText(filePath),
    size: fs.statSync(filePath).size,
  }));
  const userClaudeMd = readText(path.join(USER_CLAUDE_DIR, 'CLAUDE.md'));
  if (userClaudeMd) {
    claudeMdFiles.unshift({
      path: '~/.claude/CLAUDE.md',
      content: userClaudeMd,
      size: Buffer.byteLength(userClaudeMd),
    });
  }

  // Hooks consolidés (projet + user)
  const hooks = [];
  const collectHooks = (settings, source) => {
    if (!settings?.hooks) return;
    for (const [event, rules] of Object.entries(settings.hooks)) {
      for (const rule of rules) {
        for (const hook of rule.hooks || []) {
          hooks.push({ source, event, matcher: rule.matcher || '*', ...hook });
        }
      }
    }
  };
  collectHooks(projectSettings, 'project');
  collectHooks(userSettings, 'user');

  // Stats d'activité (14 derniers jours)
  const stats = readStats(14);

  // Mémoire projet (~/.claude/projects/<id>/memory/)
  const projectMemory = readProjectMemory(projectDirs);

  // Plans (~/.claude/plans/)
  const plans = readPlans();

  // Todos du projet courant
  const todos = readProjectTodos(projectDirs);

  res.json({
    projectSettings,
    userSettings,
    userLocalSettings,
    permissions,
    mcpServers: mcpConfig?.mcpServers || null,
    mcpAuthCache,
    claudeMdFiles,
    hooks,
    stats,
    projectMemory,
    plans,
    todos,
    paths: {
      project: PROJECT_ROOT,
      projectId,
      projectDirs: projectDirs.map((d) => d.id),
      userClaude: USER_CLAUDE_DIR,
    },
  });
});

module.exports = router;

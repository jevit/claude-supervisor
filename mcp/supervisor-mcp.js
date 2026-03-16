#!/usr/bin/env node

/**
 * MCP Server pour Claude Supervisor.
 *
 * Fournit des tools MCP qui permettent a chaque session Claude Code
 * de communiquer automatiquement avec le superviseur :
 * - Enregistrement automatique de la session
 * - Rapport d'activite (tache, actions, statut)
 * - Consultation des autres sessions, conflits, contexte partage
 * - Verrouillage de fichiers
 * - Messagerie inter-sessions
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Auto-detection du contexte de la session ---
function detectSessionName() {
  if (process.env.SESSION_NAME) return process.env.SESSION_NAME;

  const cwd = process.cwd();
  const parts = [];

  // 1. Nom du dossier courant
  parts.push(path.basename(cwd));

  // 2. Branche git si disponible
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString().trim();
    if (branch && branch !== 'HEAD') parts.push(`[${branch}]`);
  } catch { /* pas un repo git */ }

  // 3. Contexte depuis CLAUDE.md si present
  try {
    const claudeMd = path.join(cwd, '.claude', 'CLAUDE.md');
    if (fs.existsSync(claudeMd)) {
      const content = fs.readFileSync(claudeMd, 'utf-8');
      // Extraire la premiere ligne significative (titre ou description)
      const match = content.match(/^#\s+(.+)/m);
      if (match) parts.push(`- ${match[1].substring(0, 40)}`);
    }
  } catch { /* pas de CLAUDE.md */ }

  return parts.join(' ') || `Claude ${process.pid}`;
}

function detectProjectInfo() {
  const cwd = process.cwd();
  const info = { directory: cwd };

  // Package.json
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
    info.projectName = pkg.name;
  } catch { /* pas de package.json */ }

  // Git remote
  try {
    const remote = execSync('git remote get-url origin', { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString().trim();
    info.gitRemote = remote;
  } catch { /* pas de remote */ }

  return info;
}

// --- Configuration ---
const SUPERVISOR_URL = process.env.SUPERVISOR_URL || 'http://localhost:3001';
const SESSION_DIR = process.env.SESSION_DIR || process.cwd();
const SESSION_NAME = detectSessionName();
const SESSION_ID = process.env.SESSION_ID || crypto.randomUUID();
const PROJECT_INFO = detectProjectInfo();

// --- HTTP helper pour appeler l'API du superviseur ---
function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPERVISOR_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// --- Enregistrement automatique de la session ---
let sessionRegistered = false;

async function ensureRegistered() {
  if (sessionRegistered) return;
  try {
    await apiCall('POST', '/api/sessions', {
      id: SESSION_ID,
      name: SESSION_NAME,
      directory: SESSION_DIR,
      status: 'active',
      projectName: PROJECT_INFO.projectName,
      gitRemote: PROJECT_INFO.gitRemote,
    });
    sessionRegistered = true;
  } catch {
    // Le serveur n'est peut-etre pas demarre, on reessaiera
  }
}

// --- Definition des tools ---
const TOOLS = [
  {
    name: 'supervisor_report_task',
    description: 'Signale au superviseur la tache en cours dans cette session. Appeler a chaque nouvelle tache ou changement de contexte.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Description de la tache en cours' },
      },
      required: ['task'],
    },
  },
  {
    name: 'supervisor_log_action',
    description: 'Enregistre une action dans le journal du superviseur (ex: fichier modifie, test lance, commit).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: "Description de l'action effectuee" },
      },
      required: ['action'],
    },
  },
  {
    name: 'supervisor_set_status',
    description: 'Change le statut de cette session (active, idle, error).',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'idle', 'error'], description: 'Nouveau statut' },
      },
      required: ['status'],
    },
  },
  {
    name: 'supervisor_set_thinking',
    description: "Met a jour l'etat de reflexion affiche dans le dashboard (ce que Claude est en train d'analyser).",
    inputSchema: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: 'Etat de reflexion actuel' },
      },
      required: ['thinking'],
    },
  },
  {
    name: 'supervisor_get_sessions',
    description: 'Recupere la liste de toutes les sessions Claude Code actives et leur etat actuel.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'supervisor_get_recap',
    description: 'Recupere le recap global du superviseur (nombre de sessions, statuts, taches en cours).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'supervisor_get_conflicts',
    description: 'Recupere les conflits actifs (fichiers modifies par plusieurs sessions, meme repertoire).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'supervisor_lock_file',
    description: 'Declare un verrou sur un fichier pour prevenir les conflits avec les autres sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Chemin du fichier a verrouiller' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'supervisor_unlock_file',
    description: 'Libere le verrou sur un fichier.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Chemin du fichier a deverrouiller' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'supervisor_get_locks',
    description: 'Recupere tous les verrous de fichiers actifs.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'supervisor_send_message',
    description: "Envoie un message a une autre session ou a toutes les sessions (to='all').",
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: "ID de la session destinataire, ou 'all' pour toutes" },
        content: { type: 'string', description: 'Contenu du message' },
        type: { type: 'string', enum: ['info', 'warning', 'error', 'request'], description: 'Type de message (defaut: info)' },
      },
      required: ['to', 'content'],
    },
  },
  {
    name: 'supervisor_get_messages',
    description: 'Recupere les messages recus par cette session.',
    inputSchema: {
      type: 'object',
      properties: {
        unreadOnly: { type: 'boolean', description: 'Uniquement les messages non lus (defaut: true)' },
      },
    },
  },
  {
    name: 'supervisor_get_context',
    description: 'Recupere le contexte partage. Si key est fourni, retourne uniquement cette entree. Supporte le prefixe wildcard (ex: "squad:result:" retourne toutes les entrees commencant par ce prefixe).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Cle exacte ou prefixe (terminer par ":" pour un prefixe)' },
      },
    },
  },
  {
    name: 'supervisor_set_context',
    description: 'Ajoute ou met a jour une entree de contexte partage visible par toutes les sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: "Cle de l'entree (ex: 'convention-naming', 'decision-auth')" },
        value: { type: 'string', description: 'Valeur/description' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'supervisor_get_timeline',
    description: 'Recupere les derniers evenements de la timeline unifiee (toutes sessions confondues).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: "Nombre d'evenements a recuperer (defaut: 20)" },
        type: { type: 'string', description: "Filtrer par type d'evenement (ex: session:updated, task:completed)" },
      },
    },
  },
  {
    name: 'supervisor_get_notifications',
    description: 'Recupere les notifications non lues du superviseur (alertes, conflits, erreurs).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'supervisor_get_own_output',
    description: 'Recupere les dernieres lignes de sortie du terminal de cette session (buffer PTY). Utile pour analyser sa propre activite recente.',
    inputSchema: {
      type: 'object',
      properties: {
        last: { type: 'number', description: 'Nombre de caracteres a recuperer (defaut: 2000)', default: 2000 },
      },
    },
  },
  {
    name: 'supervisor_health_status',
    description: 'Recupere le statut de sante du superviseur et les resultats des health checks.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'supervisor_git_enqueue',
    description: "Ajoute un commit a la file d'attente Git du superviseur pour eviter les conflits entre sessions.",
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repertoire du projet git' },
        message: { type: 'string', description: 'Message de commit' },
      },
      required: ['directory', 'message'],
    },
  },
  {
    name: 'supervisor_git_complete',
    description: "Signale qu'un commit de la file d'attente a ete effectue.",
    inputSchema: {
      type: 'object',
      properties: {
        entryId: { type: 'string', description: "ID de l'entree dans la file" },
      },
      required: ['entryId'],
    },
  },
  {
    name: 'supervisor_git_queue',
    description: "Recupere la file d'attente de commits Git.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'supervisor_git_branches',
    description: 'Recupere les branches Git actives dans un repertoire.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Repertoire du projet git' },
      },
      required: ['directory'],
    },
  },
];

// --- Handlers des tools ---
async function handleToolCall(name, args) {
  await ensureRegistered();

  switch (name) {
    case 'supervisor_report_task':
      await apiCall('PUT', `/api/sessions/${SESSION_ID}`, { currentTask: args.task });
      return `Tache mise a jour: ${args.task}`;

    case 'supervisor_log_action':
      await apiCall('PUT', `/api/sessions/${SESSION_ID}`, { action: args.action });
      return `Action enregistree: ${args.action}`;

    case 'supervisor_set_status':
      await apiCall('PUT', `/api/sessions/${SESSION_ID}`, { status: args.status });
      return `Statut: ${args.status}`;

    case 'supervisor_set_thinking':
      await apiCall('PUT', `/api/sessions/${SESSION_ID}`, { thinkingState: args.thinking });
      return `Reflexion: ${args.thinking}`;

    case 'supervisor_get_sessions': {
      const sessions = await apiCall('GET', '/api/sessions');
      return JSON.stringify(sessions, null, 2);
    }

    case 'supervisor_get_recap': {
      const recap = await apiCall('GET', '/api/sessions/recap');
      return JSON.stringify(recap, null, 2);
    }

    case 'supervisor_get_conflicts': {
      const conflicts = await apiCall('GET', '/api/conflicts');
      return conflicts.length === 0
        ? 'Aucun conflit actif.'
        : JSON.stringify(conflicts, null, 2);
    }

    case 'supervisor_lock_file': {
      const result = await apiCall('POST', '/api/locks', {
        filePath: args.filePath,
        sessionId: SESSION_ID,
      });
      if (result.conflict) {
        return `Lock acquis sur ${args.filePath} — ATTENTION: conflit avec ${result.holders.length} session(s)`;
      }
      return `Lock acquis sur ${args.filePath}`;
    }

    case 'supervisor_unlock_file': {
      await apiCall('DELETE', '/api/locks', {
        filePath: args.filePath,
        sessionId: SESSION_ID,
      });
      return `Lock libere sur ${args.filePath}`;
    }

    case 'supervisor_get_locks': {
      const locks = await apiCall('GET', '/api/locks');
      return locks.length === 0
        ? 'Aucun lock actif.'
        : JSON.stringify(locks, null, 2);
    }

    case 'supervisor_send_message': {
      const msg = await apiCall('POST', '/api/messages', {
        from: SESSION_ID,
        to: args.to,
        type: args.type || 'info',
        content: args.content,
      });
      return `Message envoye a ${args.to}: ${args.content}`;
    }

    case 'supervisor_get_messages': {
      const unread = args.unreadOnly !== false ? 'true' : 'false';
      const messages = await apiCall('GET', `/api/messages?to=${SESSION_ID}&unread=${unread}`);
      if (!messages || messages.length === 0) return 'Aucun message.';
      return JSON.stringify(messages, null, 2);
    }

    case 'supervisor_get_context': {
      const ctx = await apiCall('GET', '/api/context');
      if (!ctx || ctx.length === 0) return 'Aucun contexte partage.';
      if (args.key) {
        const isPrefix = args.key.endsWith(':');
        const filtered = isPrefix
          ? ctx.filter((e) => e.key.startsWith(args.key))
          : ctx.filter((e) => e.key === args.key);
        if (filtered.length === 0) return `Aucune entree pour la cle "${args.key}".`;
        return JSON.stringify(isPrefix ? filtered : filtered[0], null, 2);
      }
      return JSON.stringify(ctx, null, 2);
    }

    case 'supervisor_set_context': {
      await apiCall('POST', '/api/context', {
        key: args.key,
        value: args.value,
        author: SESSION_ID,
      });
      return `Contexte mis a jour: ${args.key} = ${args.value}`;
    }

    case 'supervisor_get_timeline': {
      const params = new URLSearchParams();
      params.set('limit', String(args.limit || 20));
      if (args.type) params.set('type', args.type);
      const events = await apiCall('GET', `/api/timeline?${params}`);
      if (!events || events.length === 0) return 'Aucun evenement.';
      return JSON.stringify(events, null, 2);
    }

    case 'supervisor_get_notifications': {
      const notifs = await apiCall('GET', '/api/notifications?unread=true');
      if (!notifs || notifs.length === 0) return 'Aucune notification non lue.';
      return JSON.stringify(notifs, null, 2);
    }

    case 'supervisor_get_own_output': {
      // Recuperer le buffer du terminal PTY de cette session (#35)
      const last = args.last || 2000;
      try {
        const data = await apiCall('GET', `/api/terminals/${SESSION_ID}/output?last=${last}`);
        if (data?.output) return data.output;
        return 'Aucune sortie disponible (session non reconnue comme terminal PTY).';
      } catch {
        return 'Impossible de recuperer la sortie terminal.';
      }
    }

    case 'supervisor_health_status': {
      const [health, checks] = await Promise.all([
        apiCall('GET', '/api/health'),
        apiCall('GET', '/api/health-checks'),
      ]);
      return JSON.stringify({ server: health, checks }, null, 2);
    }

    case 'supervisor_git_enqueue': {
      const entry = await apiCall('POST', '/api/git/queue', {
        sessionId: SESSION_ID,
        directory: args.directory,
        message: args.message,
      });
      return `Commit ajoute a la file: ${entry.id} (${args.message})`;
    }

    case 'supervisor_git_complete': {
      const entry = await apiCall('PUT', `/api/git/queue/${args.entryId}/complete`);
      return `Commit ${args.entryId} marque comme complete`;
    }

    case 'supervisor_git_queue': {
      const queue = await apiCall('GET', '/api/git/queue');
      if (!queue || queue.length === 0) return "File d'attente vide.";
      return JSON.stringify(queue, null, 2);
    }

    case 'supervisor_git_branches': {
      const branches = await apiCall('GET', `/api/git/branches?directory=${encodeURIComponent(args.directory)}`);
      if (!branches || branches.length === 0) return 'Aucune branche trouvee.';
      return JSON.stringify(branches, null, 2);
    }

    default:
      throw new Error(`Tool inconnu: ${name}`);
  }
}

// --- Heartbeat periodique ---
// Envoie un ping toutes les 30s pour maintenir la session "active" dans le dashboard
let _heartbeatTimer = null;
function startHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(async () => {
    try {
      await apiCall('PUT', `/api/sessions/${SESSION_ID}/heartbeat`, {
        directory: SESSION_DIR,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Superviseur non accessible, on continue silencieusement
    }
  }, 30000);
  // Ne pas empecher le process de quitter
  if (_heartbeatTimer.unref) _heartbeatTimer.unref();
}

// --- Serveur MCP ---
const server = new Server(
  { name: 'claude-supervisor', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleToolCall(name, args || {});

    // Auto-reporter chaque appel MCP comme activite (heartbeat implicite)
    // Pas besoin de rapporter les tools de lecture qui ne changent rien
    if (!name.startsWith('supervisor_get_') && name !== 'supervisor_health_status') {
      apiCall('PUT', `/api/sessions/${SESSION_ID}/heartbeat`, {
        action: `MCP: ${name}`,
        directory: SESSION_DIR,
        timestamp: new Date().toISOString(),
      }).catch(() => {}); // Fire and forget
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Erreur: ${err.message}` }],
    };
  }
});

// --- Demarrage ---
async function main() {
  // Enregistrer la session des le demarrage
  await ensureRegistered();

  // Demarrer le heartbeat periodique
  startHeartbeat();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MCP Server error: ${err.message}\n`);
  process.exit(1);
});

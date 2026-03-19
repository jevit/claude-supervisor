const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
require('dotenv').config();

const taskRoutes = require('./routes/tasks');
const sessionRoutes = require('./routes/sessions');
const { AgentSupervisor } = require('./services/supervisor');
const { TerminalTracker } = require('./services/terminal-tracker');
const { JsonStore } = require('./services/json-store');
const { WsProtocol } = require('./services/ws-protocol');
const { EventLog } = require('./services/event-log');
const { FileLockManager } = require('./services/file-lock-manager');
const { MessageBus } = require('./services/message-bus');
const { HealthChecker } = require('./services/health-checker');
const { ConflictDetector } = require('./services/conflict-detector');
const { SharedContext } = require('./services/shared-context');
const { EnvWatcher } = require('./services/env-watcher');
const { GitOrchestrator } = require('./services/git-orchestrator');
const { ApprovalRules } = require('./services/approval-rules');
const { SquadManager } = require('./services/squad-manager');
const { SquadTemplates } = require('./services/squad-templates');
const { TerminalManager } = require('./services/terminal-manager');
const { WorktreeManager } = require('./services/worktree-manager');
const terminalRoutes = require('./routes/terminals');
const squadRoutes = require('./routes/squads');
const squadTemplateRoutes = require('./routes/squad-templates');
const timelineRoutes = require('./routes/timeline');
const lockRoutes = require('./routes/locks');
const messageRoutes = require('./routes/messages');
const healthCheckRoutes = require('./routes/health-checks');
const conflictRoutes = require('./routes/conflicts');
const contextRoutes = require('./routes/context');
const envRoutes = require('./routes/env');
const gitRoutes = require('./routes/git');
const agentRoutes = require('./routes/agents');
const claudeConfigRoutes = require('./routes/claude-config');

// Charger settings.json AVANT de configurer le serveur
let settings = {};
const settingsPath = path.resolve(__dirname, '../../.claude/settings.json');
try {
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    console.log('Settings loaded from', settingsPath);
  }
} catch (err) {
  console.warn('Impossible de charger settings.json:', err.message);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// CORS limité aux origines locales connues (#71)
const allowedOrigins = (settings.corsOrigins || ['http://localhost:3000', 'http://127.0.0.1:3000']);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Auth token optionnel (#68) — si défini dans settings.json, exiger X-Supervisor-Token sur les routes API
const SUPERVISOR_TOKEN = settings.authToken || process.env.SUPERVISOR_TOKEN || null;
if (SUPERVISOR_TOKEN) {
  app.use('/api/', (req, res, next) => {
    const token = req.headers['x-supervisor-token'];
    if (!token || token !== SUPERVISOR_TOKEN) {
      return res.status(401).json({ error: 'Token d\'authentification invalide ou manquant (X-Supervisor-Token)' });
    }
    next();
  });
  console.log('Auth token activé — les requêtes API nécessitent X-Supervisor-Token');
}

// Initialiser le store de persistance
const dataPath = path.resolve(__dirname, '../../data/supervisor-data.json');
const store = new JsonStore(dataPath, { debounceMs: 1000 });
store.load();

// Journal d'evenements unifie
const eventLog = new EventLog(store, { maxEvents: 500 });

// Debounce pour l'analyse de conflits
let _conflictAnalysisTimer = null;
const CONFLICT_TRIGGER_EVENTS = new Set([
  'session:registered', 'session:updated', 'session:removed',
  'lock:acquired', 'lock:released', 'lock:released-all',
]);

// Broadcast updates to all connected dashboard clients
// Pour terminal:output, filtrer selon les abonnements WS (#54) — wsProtocol défini plus bas
let wsProtocol = null; // sera initialisé après
function broadcast(event, data) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  const isTerminalOutput = event === 'terminal:output';
  const terminalId = isTerminalOutput ? data?.terminalId : null;

  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    // Filtrage subscription pour terminal:output
    if (isTerminalOutput && wsProtocol && terminalId) {
      if (!wsProtocol.isSubscribedTo(client, terminalId)) return;
    }
    client.send(message);
  });
  // Enregistrer dans le journal unifie
  const source = data?.id || data?.sessionId || data?.agentId || 'system';
  eventLog.log(event, data, source);

  // Analyser les conflits apres certains evenements (debounce 500ms)
  if (CONFLICT_TRIGGER_EVENTS.has(event) && conflictDetector) {
    if (_conflictAnalysisTimer) clearTimeout(_conflictAnalysisTimer);
    _conflictAnalysisTimer = setTimeout(() => {
      _conflictAnalysisTimer = null;
      conflictDetector.analyze();
    }, 500);
  }
}

// Initialiser les services avec le store
const supervisor = new AgentSupervisor(broadcast, store);
const tracker = new TerminalTracker(broadcast, store);
const lockManager = new FileLockManager(broadcast, store);
const messageBus = new MessageBus(broadcast, store);
const healthChecker = new HealthChecker(broadcast, store);
const conflictDetector = new ConflictDetector(tracker, lockManager, broadcast, store);
const sharedContext = new SharedContext(broadcast, store);
const envWatcher = new EnvWatcher(broadcast, store);
const gitOrchestrator = new GitOrchestrator(broadcast, store);
const approvalRules = new ApprovalRules(store);

// Initialiser le gestionnaire de terminaux (node-pty)
// sharedContext est passe pour injecter le contexte dans le prompt au spawn
const terminalManager = new TerminalManager(tracker, broadcast, store, sharedContext);
// Restaurer les sessions interrompues depuis le store
terminalManager.loadPersistedSessions();

// Initialiser le gestionnaire de worktrees git
const repoRoot      = path.resolve(__dirname, '../../');
const worktreesDir  = process.env.WORKTREES_DIR || settings.worktreeBase || path.resolve(repoRoot, '../cs-worktrees'); // #80
const worktreeManager = new WorktreeManager(repoRoot, worktreesDir);
console.log(`WorktreeManager: repo=${repoRoot}, worktrees=${worktreesDir}`);

// Initialiser le squad manager
const squadManager   = new SquadManager(terminalManager, sharedContext, messageBus, broadcast, store, worktreeManager);
const squadTemplates = new SquadTemplates(store);

// Initialiser le protocole WebSocket et câbler la référence pour le filtrage (#54)
wsProtocol = new WsProtocol(wss, tracker, broadcast, { lockManager, messageBus, approvalRules });

app.locals.broadcast  = broadcast;
app.locals.supervisor = supervisor;
app.locals.tracker = tracker;
app.locals.settings = settings;
app.locals.store = store;
app.locals.wsProtocol = wsProtocol;
app.locals.eventLog = eventLog;
app.locals.lockManager = lockManager;
app.locals.messageBus = messageBus;
app.locals.healthChecker = healthChecker;
app.locals.conflictDetector = conflictDetector;
app.locals.sharedContext = sharedContext;
app.locals.envWatcher = envWatcher;
app.locals.gitOrchestrator = gitOrchestrator;
app.locals.approvalRules = approvalRules;
app.locals.terminalManager  = terminalManager;
app.locals.squadManager     = squadManager;
app.locals.squadTemplates   = squadTemplates;
app.locals.worktreeManager  = worktreeManager;

// REST API routes
app.use('/api/tasks', taskRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/locks', lockRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/health-checks', healthCheckRoutes);
app.use('/api/conflicts', conflictRoutes);
app.use('/api/context', contextRoutes);
app.use('/api/env', envRoutes);
app.use('/api/git', gitRoutes);
app.use('/api/terminals', terminalRoutes);
app.use('/api/squads', squadRoutes);
app.use('/api/squad-templates', squadTemplateRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/claude-config', claudeConfigRoutes);

app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    sessions: tracker.getAllSessions().length,
    agents: supervisor.getAllAgents().length,
    connections: wsProtocol.getStats(),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
  });
});

// Purge des données anciennes (#45)
app.post('/api/admin/purge', (req, res) => {
  const { daysTerminals = 7, daysSquads = 30 } = req.body || {};
  const now = Date.now();
  const msTerminals = daysTerminals * 86400000;
  const msSquads    = daysSquads   * 86400000;

  // Purger terminaux exited anciens du store (stockés comme tableau)
  const terminalsList = store.get('terminals') || [];
  let purgedT = 0;
  const filteredTerminals = terminalsList.filter((t) => {
    if (t.status === 'exited' && t.exitedAt && (now - new Date(t.exitedAt).getTime()) > msTerminals) {
      purgedT++;
      return false;
    }
    return true;
  });
  if (purgedT > 0) store.set('terminals', filteredTerminals);

  // Purger squads terminés anciens
  const squads = store.get('squads') || [];
  const filteredSquads = squads.filter((s) => {
    if (['completed', 'cancelled', 'partial'].includes(s.status) && s.completedAt) {
      return (now - new Date(s.completedAt).getTime()) <= msSquads;
    }
    return true;
  });
  const purgedS = squads.length - filteredSquads.length;
  if (purgedS > 0) store.set('squads', filteredSquads);

  res.json({ purgedTerminals: purgedT, purgedSquads: purgedS });
});

// Nettoyage des worktrees orphelins (#85)
app.post('/api/admin/cleanup-worktrees', (req, res) => {
  const wm = app.locals.worktreeManager;
  if (!wm) return res.status(400).json({ error: 'Worktrees non disponibles' });
  try {
    const removed = wm.cleanupOrphaned ? wm.cleanupOrphaned() : 0;
    res.json({ removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json(settings);
});

// Mettre à jour les settings depuis l'UI (#25)
app.put('/api/settings', (req, res) => {
  try {
    const allowed = ['defaultModel', 'maxTerminals', 'heartbeatInterval', 'maxEvents', 'worktreeBase', 'dangerousModeDefault', 'showConflicts', 'showAnalytics', 'showJournal'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    Object.assign(settings, updates);
    app.locals.settings = settings;
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nettoyage periodique des sessions inactives (toutes les 60s)
let _staleCheckTimer = setInterval(() => {
  tracker.cleanupStale(120000); // 2 min sans mise a jour = stale
}, 60000);

// Persistance périodique de l'état des terminaux (#86 — survit au SIGKILL)
let _persistTimer = setInterval(() => {
  terminalManager.persistState();
}, 30000);

// Sauvegarder les donnees avant l'arret
function gracefulShutdown() {
  console.log('Sauvegarde des donnees avant arret...');
  clearInterval(_staleCheckTimer);
  clearInterval(_persistTimer);
  _staleCheckTimer = null;
  squadManager.destroy();
  terminalManager.persistState(); // Sauvegarder les sessions actives avant de les tuer
  terminalManager.destroyAll();
  healthChecker.destroy();
  envWatcher.destroy();
  store.destroy();
  process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Claude Supervisor API running on http://localhost:${PORT}`);
  if (!supervisor.client) {
    console.log('Mode sans API Anthropic - fonctionnalites de supervision uniquement');
  }
});

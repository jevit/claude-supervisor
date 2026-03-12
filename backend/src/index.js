const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const agentRoutes = require('./routes/agents');
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
const { NotificationManager } = require('./services/notification-manager');
const { GitOrchestrator } = require('./services/git-orchestrator');
const timelineRoutes = require('./routes/timeline');
const lockRoutes = require('./routes/locks');
const messageRoutes = require('./routes/messages');
const healthCheckRoutes = require('./routes/health-checks');
const conflictRoutes = require('./routes/conflicts');
const contextRoutes = require('./routes/context');
const envRoutes = require('./routes/env');
const notificationRoutes = require('./routes/notifications');
const gitRoutes = require('./routes/git');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Charger settings.json
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
function broadcast(event, data) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
  // Enregistrer dans le journal unifie
  const source = data?.id || data?.sessionId || data?.agentId || 'system';
  eventLog.log(event, data, source);

  // Generer des notifications pour les evenements importants
  if (notificationManager) {
    const notification = notificationManager.processEvent(event, data);
    if (notification) {
      // Broadcaster la notification aux dashboards
      const notifMsg = JSON.stringify({
        event: 'notification:new',
        data: notification,
        timestamp: new Date().toISOString(),
      });
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(notifMsg);
        }
      });
    }
  }

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
const notificationManager = new NotificationManager(store);
const gitOrchestrator = new GitOrchestrator(broadcast, store);

// Initialiser le protocole WebSocket
const wsProtocol = new WsProtocol(wss, tracker, broadcast, { lockManager, messageBus });

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
app.locals.notificationManager = notificationManager;
app.locals.gitOrchestrator = gitOrchestrator;

// REST API routes
app.use('/api/agents', agentRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/locks', lockRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/health-checks', healthCheckRoutes);
app.use('/api/conflicts', conflictRoutes);
app.use('/api/context', contextRoutes);
app.use('/api/env', envRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/git', gitRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    sessions: tracker.getAllSessions().length,
    agents: supervisor.getAllAgents().length,
    connections: wsProtocol.getStats(),
  });
});

app.get('/api/settings', (req, res) => {
  res.json(settings);
});

// Sauvegarder les donnees avant l'arret
function gracefulShutdown() {
  console.log('Sauvegarde des donnees avant arret...');
  healthChecker.destroy();
  envWatcher.destroy();
  store.destroy();
  process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Nettoyage periodique des sessions inactives (toutes les 60s)
const _staleCheckTimer = setInterval(() => {
  tracker.cleanupStale(120000); // 2 min sans mise a jour = stale
}, 60000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Claude Supervisor API running on http://localhost:${PORT}`);
  if (!supervisor.client) {
    console.log('Mode sans API Anthropic - fonctionnalites de supervision uniquement');
  }
});

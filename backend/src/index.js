const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const agentRoutes = require('./routes/agents');
const taskRoutes = require('./routes/tasks');
const { AgentSupervisor } = require('./services/supervisor');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// REST API routes
app.use('/api/agents', agentRoutes);
app.use('/api/tasks', taskRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// WebSocket for real-time dashboard updates
wss.on('connection', (ws) => {
  console.log('Dashboard client connected');

  ws.on('close', () => {
    console.log('Dashboard client disconnected');
  });
});

// Broadcast updates to all connected dashboard clients
function broadcast(event, data) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Initialize supervisor
const supervisor = new AgentSupervisor(broadcast);
app.locals.supervisor = supervisor;

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Claude Supervisor API running on http://localhost:${PORT}`);
});

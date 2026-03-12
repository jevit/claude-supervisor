#!/usr/bin/env node

/**
 * Hook Claude Code: post_tool_call
 *
 * Appele automatiquement par Claude Code apres chaque appel d'outil.
 * Envoie un heartbeat + l'action effectuee au superviseur.
 *
 * Variables d'environnement disponibles (fournies par Claude Code) :
 *  - CLAUDE_SESSION_ID   : ID de la session Claude Code
 *  - CLAUDE_TOOL_NAME    : Nom de l'outil appele (Read, Write, Edit, Bash, etc.)
 *  - CLAUDE_TOOL_INPUT   : Input JSON de l'outil (tronque)
 *  - CLAUDE_TOOL_OUTPUT  : Output de l'outil (tronque)
 *  - CLAUDE_PROJECT_DIR  : Repertoire du projet
 *
 * Le script lit stdin pour recevoir les donnees du hook au format JSON.
 */

const http = require('http');
const path = require('path');
const crypto = require('crypto');

const SUPERVISOR_URL = process.env.SUPERVISOR_URL || 'http://localhost:3001';

// Lire les donnees du hook depuis stdin
let inputData = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  processHook(inputData).catch(() => {
    // Silencieux si le superviseur n'est pas accessible
  });
});

// Timeout pour ne pas bloquer Claude Code si stdin ne se ferme pas
setTimeout(() => {
  processHook(inputData).catch(() => {});
}, 500);

async function processHook(raw) {
  let hookData = {};
  try {
    hookData = JSON.parse(raw);
  } catch {
    // Pas de JSON valide, on utilise les variables d'env
  }

  const toolName = hookData.tool_name || process.env.CLAUDE_TOOL_NAME || 'unknown';
  const sessionId = hookData.session_id || process.env.CLAUDE_SESSION_ID || null;
  const projectDir = hookData.project_dir || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Extraire un resume de l'action depuis l'input de l'outil
  let actionSummary = toolName;
  try {
    const input = hookData.tool_input || process.env.CLAUDE_TOOL_INPUT;
    if (input) {
      const parsed = typeof input === 'string' ? JSON.parse(input) : input;
      if (parsed.file_path) {
        actionSummary = `${toolName}: ${path.basename(parsed.file_path)}`;
      } else if (parsed.command) {
        // Tronquer les commandes longues
        const cmd = parsed.command.substring(0, 80);
        actionSummary = `${toolName}: ${cmd}`;
      } else if (parsed.pattern) {
        actionSummary = `${toolName}: ${parsed.pattern}`;
      }
    }
  } catch {
    // Garder le resume basique
  }

  // Identifier la session dans le superviseur
  // Si pas de SESSION_ID, generer un ID stable base sur le directory
  const supervisorSessionId = sessionId || stableId(projectDir);

  // Envoyer le heartbeat + action au superviseur
  await apiCall('PUT', `/api/sessions/${supervisorSessionId}/heartbeat`, {
    action: actionSummary,
    directory: projectDir,
    tool: toolName,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Genere un ID stable a partir du directory (meme session = meme ID)
 */
function stableId(dir) {
  return crypto.createHash('md5').update(dir).digest('hex').substring(0, 12);
}

function apiCall(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SUPERVISOR_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
      timeout: 2000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

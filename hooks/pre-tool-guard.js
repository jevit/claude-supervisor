#!/usr/bin/env node

/**
 * Hook Claude Code: PreToolUse
 *
 * Bloque l'écriture dans un fichier si un autre agent le verrouille.
 * Retourne exit code 2 pour bloquer l'opération + message d'erreur sur stderr.
 *
 * Variables d'environnement :
 *  - CLAUDE_SESSION_ID   : ID de la session
 *  - CLAUDE_TOOL_NAME    : Nom de l'outil (Write, Edit, MultiEdit, etc.)
 *  - CLAUDE_TOOL_INPUT   : Input JSON de l'outil
 */

const http = require('http');
const path = require('path');

const SUPERVISOR_URL = process.env.SUPERVISOR_URL || 'http://localhost:3001';
const SESSION_ID     = process.env.CLAUDE_SESSION_ID || null;

// Outils d'écriture qui doivent être vérifiés
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

let inputData = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  checkLock(inputData).catch(() => {
    // Si le superviseur est inaccessible, ne pas bloquer
    process.exit(0);
  });
});

// Timeout : si stdin ne se ferme pas, laisser passer après 800ms
setTimeout(() => {
  checkLock(inputData).catch(() => process.exit(0));
}, 800);

async function checkLock(raw) {
  let hookData = {};
  try { hookData = JSON.parse(raw); } catch { /* utiliser les env vars */ }

  const toolName = hookData.tool_name || process.env.CLAUDE_TOOL_NAME || '';
  if (!WRITE_TOOLS.has(toolName)) {
    process.exit(0); // Pas un outil d'écriture, laisser passer
  }

  // Extraire le chemin du fichier cible
  let filePath = null;
  try {
    const input = hookData.tool_input || process.env.CLAUDE_TOOL_INPUT;
    const parsed = typeof input === 'string' ? JSON.parse(input) : (input || {});
    filePath = parsed.file_path || parsed.path || null;
  } catch { /* pas d'input JSON */ }

  if (!filePath) {
    process.exit(0); // Pas de fichier identifiable, laisser passer
  }

  // Vérifier si le fichier est verrouillé par une autre session
  try {
    const locksJson = await apiGet('/api/locks');
    const locks = JSON.parse(locksJson);
    const normalizedTarget = path.resolve(filePath).replace(/\\/g, '/').toLowerCase();

    const blocking = locks.filter((lock) => {
      if (SESSION_ID && lock.sessionId === SESSION_ID) return false; // Notre propre lock, OK
      const lockPath = (lock.file || '').replace(/\\/g, '/').toLowerCase();
      return normalizedTarget.startsWith(lockPath) || lockPath.startsWith(normalizedTarget);
    });

    if (blocking.length > 0) {
      const lock = blocking[0];
      const msg = `[claude-supervisor] Fichier verrouillé par "${lock.sessionId}" (lock: ${lock.file}). ` +
                  `Attendre ou utiliser supervisor_unlock_file via MCP.`;
      process.stderr.write(msg + '\n');
      process.exit(2); // Claude Code interprète exit 2 comme un blocage
    }
  } catch {
    // Superviseur inaccessible ou erreur réseau → ne pas bloquer
  }

  process.exit(0);
}

function apiGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, SUPERVISOR_URL);
    const req = http.request({
      method: 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      timeout: 1500,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

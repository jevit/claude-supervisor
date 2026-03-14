import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GitDiffPanel from './GitDiffPanel';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'il y a ' + Math.round(diff / 1000) + 's';
  if (diff < 3600000) return 'il y a ' + Math.round(diff / 60000) + 'min';
  if (diff < 86400000) return 'il y a ' + Math.round(diff / 3600000) + 'h';
  return 'il y a ' + Math.round(diff / 86400000) + 'j';
}

async function sendCommand(sessionId, command, params = {}) {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, params }),
    });
    return res.ok;
  } catch (err) {
    console.error('Erreur envoi commande:', err);
    return false;
  }
}

async function postJson(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
}

function GitPanel({ git }) {
  if (!git) return null;
  const hasChanges = (git.modified?.length || 0) + (git.staged?.length || 0) > 0;
  return (
    <div className="git-panel">
      <span className="git-branch">⎇ {git.branch}</span>
      {git.ahead > 0 && <span className="git-badge git-ahead">↑{git.ahead}</span>}
      {git.behind > 0 && <span className="git-badge git-behind">↓{git.behind}</span>}
      {git.staged?.length > 0 && <span className="git-badge git-staged">+{git.staged.length} staged</span>}
      {git.modified?.length > 0 && <span className="git-badge git-modified">~{git.modified.length} modif.</span>}
      {git.untracked?.length > 0 && <span className="git-badge git-untracked">?{git.untracked.length}</span>}
      {!hasChanges && git.branch && <span className="git-clean">✓ propre</span>}
    </div>
  );
}

export default function SessionCard({ session }) {
  const navigate = useNavigate();
  const [showMessage, setShowMessage] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [showQueue, setShowQueue] = useState(false);
  const [queueTask, setQueueTask] = useState('');
  const [showInject, setShowInject] = useState(false);
  const [injectText, setInjectText] = useState('');
  const [showDiff, setShowDiff] = useState(false);

  const statusClass = `status-badge status-${session.status}`;
  const isWaiting = session.status === 'waiting_approval';
  const isPaused = session.status === 'idle';
  const isActive = session.status === 'active';
  const queueLen = session.taskQueue?.length || 0;

  function handleSendMessage(e) {
    e.preventDefault();
    if (!messageText.trim()) return;
    sendCommand(session.id, 'message', { content: messageText.trim() });
    setMessageText('');
    setShowMessage(false);
  }

  function handleAddToQueue(e) {
    e.preventDefault();
    if (!queueTask.trim()) return;
    postJson(`/api/sessions/${session.id}/queue`, { task: queueTask.trim() });
    setQueueTask('');
    setShowQueue(false);
  }

  function handleInject(e) {
    e.preventDefault();
    if (!injectText.trim()) return;
    postJson(`/api/sessions/${session.id}/inject`, { prompt: injectText.trim() });
    setInjectText('');
    setShowInject(false);
  }

  function handleNextTask() {
    fetch(`/api/sessions/${session.id}/queue/next`, { method: 'DELETE' }).catch(console.error);
  }

  return (
    <div className="card session-card">
      <div className="session-header">
        <div className="session-identity">
          <h3>{session.name}</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {session.projectName && (
              <span className="session-project">{session.projectName}</span>
            )}
            {session.isTerminal && session.terminalPid && (
              <span className="session-pid">PID {session.terminalPid}</span>
            )}
            {session.terminalModel && (
              <span className="session-model">{session.terminalModel}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {session.isTerminal && (
            <button className="ctrl-btn ctrl-open-terminal" title="Ouvrir le terminal"
              onClick={() => navigate(`/terminals?open=${session.id}`)}>
              &gt;_
            </button>
          )}
          {queueLen > 0 && (
            <span className="queue-badge" title={`${queueLen} tâche(s) en attente`}>{queueLen}</span>
          )}
          <span className={statusClass}>{session.status}</span>
        </div>
      </div>

      {/* Git status */}
      <GitPanel git={session.gitStatus} />

      <div className="session-meta">
        <span className="session-directory">{session.directory}</span>
        {session.lastUpdate && (
          <span className="session-ago">{timeAgo(session.lastUpdate)}</span>
        )}
      </div>

      {session.currentTask && (
        <div className="session-task">
          <strong>En cours:</strong> {session.currentTask}
        </div>
      )}

      {session.thinkingState && (
        <div className="session-thinking">
          <span className="thinking-pulse" />
          <strong>Reflexion:</strong> {session.thinkingState}
        </div>
      )}

      {/* File de tâches */}
      {queueLen > 0 && (
        <div className="session-queue">
          <div className="queue-header">
            <strong>File ({queueLen})</strong>
            <button className="ctrl-btn" onClick={handleNextTask} title="Dépiler la prochaine tâche">▶ Suivante</button>
          </div>
          <div className="queue-next">{session.taskQueue[0]?.task}</div>
          {queueLen > 1 && <div className="queue-more">+{queueLen - 1} autre(s)…</div>}
        </div>
      )}

      {session.recentActions && session.recentActions.length > 0 && (
        <div className="session-actions">
          <strong>Actions recentes:</strong>
          <ul>
            {session.recentActions.map((a, i) => (
              <li key={i}>
                <span className="action-text">{a.action}</span>
                <span className="action-time">{timeAgo(a.timestamp)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Approbation */}
      {isWaiting && (
        <div className="session-approval">
          <span className="approval-label">En attente d'approbation</span>
          <div className="approval-buttons">
            <button className="btn-approve" onClick={() => sendCommand(session.id, 'approve')}>Approuver</button>
            <button className="btn-reject" onClick={() => sendCommand(session.id, 'reject')}>Rejeter</button>
          </div>
        </div>
      )}

      {/* Contrôles */}
      <div className="session-controls">
        {isActive && (
          <button className="ctrl-btn" title="Pause" onClick={() => sendCommand(session.id, 'pause')}>⏸</button>
        )}
        {isPaused && (
          <button className="ctrl-btn" title="Reprendre" onClick={() => sendCommand(session.id, 'resume')}>▶</button>
        )}
        {(isActive || isPaused) && (
          <button className="ctrl-btn ctrl-cancel" title="Annuler" onClick={() => sendCommand(session.id, 'cancel')}>✕</button>
        )}
        <button className="ctrl-btn" title="Envoyer un message" onClick={() => { setShowMessage(v => !v); setShowQueue(false); setShowInject(false); }}>✉</button>
        <button className="ctrl-btn" title="Ajouter à la file" onClick={() => { setShowQueue(v => !v); setShowMessage(false); setShowInject(false); }}>☰ {queueLen > 0 ? queueLen : ''}</button>
        <button className="ctrl-btn ctrl-inject" title="Injecter un prompt" onClick={() => { setShowInject(v => !v); setShowMessage(false); setShowQueue(false); }}>⚡</button>
        {session.directory && (
          <button className={`ctrl-btn ${showDiff ? 'ctrl-diff-active' : ''}`} title="Voir le diff Git" onClick={() => setShowDiff(v => !v)}>±</button>
        )}
      </div>

      {/* Message rapide */}
      {showMessage && (
        <form className="quick-form" onSubmit={handleSendMessage}>
          <input autoFocus type="text" placeholder="Message au terminal..." value={messageText}
            onChange={(e) => setMessageText(e.target.value)} className="quick-input" />
          <button type="submit" className="quick-send">Envoyer</button>
        </form>
      )}

      {/* Ajout file de tâches */}
      {showQueue && (
        <form className="quick-form" onSubmit={handleAddToQueue}>
          <input autoFocus type="text" placeholder="Tâche à mettre en file..." value={queueTask}
            onChange={(e) => setQueueTask(e.target.value)} className="quick-input" />
          <button type="submit" className="quick-send">Ajouter</button>
        </form>
      )}

      {/* Injection de prompt */}
      {showInject && (
        <form className="quick-form inject-form" onSubmit={handleInject}>
          <textarea autoFocus placeholder="Prompt à injecter dans le terminal..." value={injectText}
            onChange={(e) => setInjectText(e.target.value)} className="quick-textarea" rows={3} />
          <button type="submit" className="quick-send inject-send">⚡ Injecter</button>
        </form>
      )}

      {/* Panneau de diff Git */}
      {showDiff && session.directory && (
        <div className="session-diff-panel">
          <GitDiffPanel
            directory={session.directory}
            terminalId={session.isTerminal ? session.id : undefined}
            onClose={() => setShowDiff(false)}
          />
        </div>
      )}

      <div className="session-footer">
        <span className="session-id" title={session.id}>{session.id.substring(0, 8)}</span>
        {session.startedAt && (
          <span className="session-started">Demarre {timeAgo(session.startedAt)}</span>
        )}
      </div>

      <style>{`
        .session-card { margin-bottom: 16px; }
        .session-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
        .session-identity { display: flex; flex-direction: column; gap: 2px; }
        .session-project { font-size: 11px; color: var(--accent); font-family: monospace; }
        .session-pid { font-size: 10px; color: var(--accent); font-family: monospace; background: rgba(139,92,246,0.1); padding: 1px 6px; border-radius: 4px; font-weight: 600; }
        .session-model { font-size: 10px; color: var(--text-secondary); background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; }
        .ctrl-open-terminal { font-family: monospace; font-weight: 700; color: var(--accent) !important; }
        .queue-badge {
          background: var(--accent); color: white; border-radius: 10px;
          font-size: 11px; font-weight: 700; padding: 1px 6px; min-width: 18px; text-align: center;
        }
        .git-panel {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          margin-bottom: 8px; font-size: 12px;
        }
        .git-branch { color: var(--text-secondary); font-family: monospace; }
        .git-badge {
          border-radius: 4px; padding: 1px 5px; font-size: 11px; font-weight: 600;
        }
        .git-ahead { background: rgba(16,185,129,0.15); color: #10b981; }
        .git-behind { background: rgba(245,158,11,0.15); color: #f59e0b; }
        .git-staged { background: rgba(139,92,246,0.15); color: var(--accent); }
        .git-modified { background: rgba(59,130,246,0.15); color: #3b82f6; }
        .git-untracked { background: rgba(107,114,128,0.15); color: #6b7280; }
        .git-clean { font-size: 11px; color: #10b981; }
        .session-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .session-directory { font-size: 13px; color: var(--text-secondary); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }
        .session-ago { font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
        .session-task { font-size: 14px; padding: 8px; background: rgba(139,92,246,0.05); border-radius: 6px; margin-bottom: 8px; }
        .session-thinking { font-size: 14px; padding: 8px; background: rgba(139,92,246,0.05); border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .thinking-pulse { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; animation: thinking-blink 1.2s ease-in-out infinite; }
        @keyframes thinking-blink { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.3; transform:scale(0.7); } }
        .session-queue { background: rgba(139,92,246,0.05); border: 1px solid rgba(139,92,246,0.15); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
        .queue-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 13px; }
        .queue-next { font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .queue-more { font-size: 11px; color: var(--border); margin-top: 2px; }
        .session-actions ul { list-style: none; padding: 0; margin-top: 4px; }
        .session-actions li { font-size: 13px; color: var(--text-secondary); padding: 2px 0; display: flex; justify-content: space-between; align-items: center; }
        .action-time { font-size: 10px; color: var(--border); flex-shrink: 0; margin-left: 8px; }
        .session-approval { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 6px; margin-bottom: 8px; gap: 8px; }
        .approval-label { font-size: 13px; color: var(--warning, #f59e0b); font-weight: 600; }
        .approval-buttons { display: flex; gap: 6px; }
        .btn-approve, .btn-reject { border: none; border-radius: 4px; padding: 4px 10px; font-size: 13px; cursor: pointer; font-weight: 600; }
        .btn-approve { background: var(--success, #10b981); color: white; }
        .btn-approve:hover { filter: brightness(1.1); }
        .btn-reject { background: var(--error, #ef4444); color: white; }
        .btn-reject:hover { filter: brightness(1.1); }
        .session-controls { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; }
        .ctrl-btn { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font-size: 13px; cursor: pointer; color: var(--text-secondary); transition: background 0.15s; white-space: nowrap; }
        .ctrl-btn:hover { background: var(--border); color: var(--text-primary); }
        .ctrl-cancel { color: var(--error, #ef4444); }
        .ctrl-inject { color: var(--accent); }
        .quick-form { display: flex; gap: 6px; margin-bottom: 8px; }
        .inject-form { flex-direction: column; }
        .quick-input { flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-size: 13px; color: var(--text-primary); }
        .quick-input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
        .quick-textarea { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; font-size: 13px; color: var(--text-primary); resize: vertical; font-family: monospace; }
        .quick-textarea:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
        .quick-send { background: var(--accent); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 13px; cursor: pointer; font-weight: 600; white-space: nowrap; }
        .quick-send:hover { filter: brightness(1.1); }
        .inject-send { align-self: flex-end; }
        .session-footer { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
        .session-id { font-family: monospace; font-size: 11px; color: var(--border); }
        .session-started { font-size: 11px; color: var(--text-secondary); }
        .ctrl-diff-active { background: var(--accent) !important; color: white !important; border-color: var(--accent) !important; }
        .session-diff-panel {
          height: 400px;
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}

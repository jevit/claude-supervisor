import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

export default function Conflicts() {
  const [conflicts, setConflicts] = useState([]);
  const [locks, setLocks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  // États de chargement par action : { [key]: bool }
  const [unlocking, setUnlocking] = useState({});
  const [notifying, setNotifying] = useState({});
  const [notified, setNotified]   = useState({});

  const fetchData = useCallback(() => {
    Promise.all([
      fetch('/api/conflicts').then((r) => r.json()),
      fetch('/api/locks').then((r) => r.json()),
    ])
      .then(([c, l]) => { setConflicts(c); setLocks(l); setLoading(false); })
      .catch(console.error);
  }, []);

  // Chargement initial + polling fallback toutes les 5s
  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 5000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Mises à jour temps réel via WS
  useWebSocket(useCallback((event) => {
    if (event.startsWith('lock:') || event.startsWith('conflict:')) fetchData();
  }, [fetchData]));

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const c = await fetch('/api/conflicts/analyze', { method: 'POST' }).then((r) => r.json());
      setConflicts(c);
    } catch {}
    setAnalyzing(false);
  };

  // Forcer le unlock d'un holder sur un fichier
  const handleForceUnlock = async (filePath, sessionId) => {
    const key = `${filePath}::${sessionId}`;
    setUnlocking((p) => ({ ...p, [key]: true }));
    try {
      await fetch('/api/locks/force-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, sessionId, reason: 'admin-ui' }),
      });
      fetchData();
    } catch {}
    setUnlocking((p) => ({ ...p, [key]: false }));
  };

  // Notifier toutes les sessions impliquées dans un conflit
  const handleNotify = async (conflict) => {
    const key = conflict.id || conflict.details?.filePath || conflict.details?.directory;
    setNotifying((p) => ({ ...p, [key]: true }));
    const path = conflict.details?.filePath || conflict.details?.directory || '';
    try {
      await fetch('/api/conflicts/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: conflict.sessions,
          message: `Conflit détecté sur "${path}". Coordonnez-vous avant de continuer.`,
        }),
      });
      setNotified((p) => ({ ...p, [key]: true }));
      setTimeout(() => setNotified((p) => ({ ...p, [key]: false })), 2500);
    } catch {}
    setNotifying((p) => ({ ...p, [key]: false }));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Conflits & Locks</h1>
        <button className="btn-primary" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? 'Analyse...' : 'Analyser maintenant'}
        </button>
      </div>

      {/* Conflits actifs */}
      <h2 style={{ marginBottom: 16 }}>
        Conflits actifs
        {conflicts.length > 0 && (
          <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: 'var(--error, #ef4444)' }}>
            {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''}
          </span>
        )}
      </h2>

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement...</span></div>
      ) : conflicts.length === 0 ? (
        <div className="card empty-state">Aucun conflit détecté</div>
      ) : (
        conflicts.map((c) => {
          const path   = c.details?.filePath || c.details?.directory || '';
          const key    = c.id || path;
          const isNotifying = notifying[key];
          const isDone      = notified[key];
          return (
            <div key={key} className={`card conflict-card severity-${c.severity}`}>
              <div className="conflict-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`status-badge status-${c.severity === 'error' ? 'error' : 'working'}`}>
                    {c.type === 'file' ? 'Fichier' : 'Répertoire'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.sessions.length} sessions</span>
                </div>
                <button
                  className="action-btn notify-btn"
                  onClick={() => handleNotify(c)}
                  disabled={isNotifying || isDone}
                >
                  {isDone ? '✓ Notifié' : isNotifying ? '...' : 'Notifier les sessions'}
                </button>
              </div>
              <p className="conflict-detail">{path}</p>
              <div className="conflict-sessions-list">
                {c.sessions.map((s) => (
                  <span key={s} className="session-tag">{s.substring(0, 8)}</span>
                ))}
              </div>
              <div className="conflict-suggestion">
                {c.type === 'file'
                  ? 'Suggestion : coordonner les modifications ou attendre que la première session termine.'
                  : 'Suggestion : vérifier que les sessions ne travaillent pas sur les mêmes fichiers.'}
              </div>
            </div>
          );
        })
      )}

      {/* Locks actifs */}
      <h2 style={{ marginTop: 32, marginBottom: 16 }}>
        Fichiers verrouillés
        {locks.length > 0 && (
          <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>
            {locks.length}
          </span>
        )}
      </h2>

      {locks.length === 0 ? (
        <div className="card empty-state">Aucun fichier verrouillé</div>
      ) : (
        <div className="locks-table">
          <div className="locks-header">
            <span>Fichier</span>
            <span>Sessions</span>
            <span>Statut</span>
            <span>Actions</span>
          </div>
          {locks.map((l) => (
            <div key={l.filePath} className={`locks-row ${l.conflict ? 'conflict-row' : ''}`}>
              <span className="lock-path" title={l.filePath}>{l.filePath}</span>
              <span className="lock-holders">
                {l.holders.map((h) => (
                  <span key={h} className="session-tag">{h.substring(0, 8)}</span>
                ))}
              </span>
              <span>
                {l.conflict
                  ? <span className="conflict-badge-inline">⚠ Conflit</span>
                  : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
              </span>
              <span className="lock-actions">
                {l.holders.map((h) => {
                  const key = `${l.filePath}::${h}`;
                  return (
                    <button
                      key={h}
                      className="action-btn unlock-btn"
                      onClick={() => handleForceUnlock(l.filePath, h)}
                      disabled={unlocking[key]}
                      title={`Forcer unlock pour ${h.substring(0, 8)}`}
                    >
                      {unlocking[key] ? '...' : 'Unlock'}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .empty-state { color: var(--text-secondary); font-size: 14px; }
        .conflict-card { margin-bottom: 12px; }
        .severity-error { border-left: 3px solid var(--error, #ef4444); }
        .severity-warning { border-left: 3px solid var(--warning, #f59e0b); }
        .conflict-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .conflict-detail { font-size: 14px; font-family: monospace; color: var(--text-primary); margin-bottom: 8px; word-break: break-all; }
        .conflict-sessions-list { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .session-tag { background: var(--bg-primary); border: 1px solid var(--border); padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; color: var(--text-secondary); }
        .conflict-suggestion { font-size: 12px; color: var(--accent); padding: 6px 10px; background: rgba(139,92,246,0.06); border-radius: 6px; margin-top: 4px; }
        .action-btn { border: none; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; font-weight: 600; transition: opacity 0.15s; }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .notify-btn { background: rgba(139,92,246,0.15); color: var(--accent); }
        .notify-btn:hover:not(:disabled) { background: rgba(139,92,246,0.25); }
        .unlock-btn { background: rgba(239,68,68,0.12); color: var(--error, #ef4444); font-size: 11px; padding: 3px 8px; }
        .unlock-btn:hover:not(:disabled) { background: rgba(239,68,68,0.25); }
        .conflict-badge-inline { font-size: 11px; font-weight: 700; color: var(--error, #ef4444); background: rgba(239,68,68,0.12); padding: 2px 8px; border-radius: 4px; }
        .locks-table { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .locks-header, .locks-row { display: grid; grid-template-columns: 1fr 180px 100px 120px; padding: 10px 16px; align-items: center; gap: 8px; }
        .locks-header { background: var(--bg-secondary); font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
        .locks-row { border-top: 1px solid var(--border); font-size: 13px; }
        .conflict-row { background: rgba(239,68,68,0.04); }
        .lock-path { font-family: monospace; word-break: break-all; font-size: 12px; }
        .lock-holders { display: flex; gap: 4px; flex-wrap: wrap; }
        .lock-actions { display: flex; gap: 4px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}

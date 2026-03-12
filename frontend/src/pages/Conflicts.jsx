import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

export default function Conflicts() {
  const [conflicts, setConflicts] = useState([]);
  const [locks, setLocks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    Promise.all([
      fetch('/api/conflicts').then((r) => r.json()),
      fetch('/api/locks').then((r) => r.json()),
    ])
      .then(([c, l]) => {
        setConflicts(c);
        setLocks(l);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useWebSocket(useCallback((event) => {
    if (event.startsWith('lock:') || event.startsWith('conflict:')) {
      fetchData();
    }
  }, [fetchData]));

  const handleForceAnalyze = () => {
    fetch('/api/conflicts/analyze', { method: 'POST' })
      .then((r) => r.json())
      .then(setConflicts)
      .catch(console.error);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Conflits & Locks</h1>
        <button className="btn-primary" onClick={handleForceAnalyze}>Analyser maintenant</button>
      </div>

      {/* Conflits actifs */}
      <h2 style={{ marginBottom: 16 }}>Conflits actifs</h2>
      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement...</span></div>
      ) : conflicts.length === 0 ? (
        <div className="card empty-state">Aucun conflit detecte</div>
      ) : (
        conflicts.map((c) => (
          <div key={c.id} className={`card conflict-card severity-${c.severity}`}>
            <div className="conflict-header">
              <span className={`status-badge status-${c.severity === 'error' ? 'error' : 'working'}`}>
                {c.type === 'file' ? 'Fichier' : 'Repertoire'}
              </span>
              <span className="conflict-sessions">{c.sessions.length} sessions</span>
            </div>
            <p className="conflict-detail">
              {c.type === 'file' ? c.details.filePath : c.details.directory}
            </p>
            <div className="conflict-sessions-list">
              {c.sessions.map((s) => (
                <span key={s} className="session-tag">{s.substring(0, 8)}</span>
              ))}
            </div>
            {/* Suggestion de resolution */}
            <div className="conflict-suggestion">
              {c.type === 'file' ? (
                <span>Suggestion : coordonner les modifications ou attendre que la premiere session termine.</span>
              ) : (
                <span>Suggestion : verifier que les sessions ne travaillent pas sur les memes fichiers.</span>
              )}
            </div>
          </div>
        ))
      )}

      {/* Locks actifs */}
      <h2 style={{ marginTop: 32, marginBottom: 16 }}>Fichiers verrouilles ({locks.length})</h2>
      {locks.length === 0 ? (
        <div className="card empty-state">Aucun fichier verrouille</div>
      ) : (
        <div className="locks-table">
          <div className="locks-header">
            <span>Fichier</span>
            <span>Sessions</span>
            <span>Conflit</span>
          </div>
          {locks.map((l) => (
            <div key={l.filePath} className={`locks-row ${l.conflict ? 'conflict-row' : ''}`}>
              <span className="lock-path">{l.filePath}</span>
              <span className="lock-holders">
                {l.holders.map((h) => (
                  <span key={h} className="session-tag">{h.substring(0, 8)}</span>
                ))}
              </span>
              <span>{l.conflict ? '!!!' : '-'}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary {
          background: var(--accent);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
        }
        .btn-primary:hover { background: var(--accent-hover); }
        .empty-state { color: var(--text-secondary); font-size: 14px; }
        .conflict-card { margin-bottom: 12px; }
        .severity-error { border-left: 3px solid var(--error); }
        .severity-warning { border-left: 3px solid var(--warning); }
        .conflict-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .conflict-sessions { font-size: 13px; color: var(--text-secondary); }
        .conflict-detail { font-size: 14px; font-family: monospace; color: var(--text-primary); margin-bottom: 8px; word-break: break-all; }
        .conflict-sessions-list { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .session-tag {
          background: var(--bg-primary);
          border: 1px solid var(--border);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-family: monospace;
          color: var(--text-secondary);
        }
        .conflict-suggestion {
          font-size: 12px;
          color: var(--accent);
          padding: 6px 10px;
          background: rgba(139, 92, 246, 0.06);
          border-radius: 6px;
          margin-top: 4px;
        }
        .locks-table { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .locks-header, .locks-row { display: grid; grid-template-columns: 1fr 200px 80px; padding: 10px 16px; align-items: center; }
        .locks-header { background: var(--bg-secondary); font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
        .locks-row { border-top: 1px solid var(--border); font-size: 13px; }
        .conflict-row { background: rgba(239, 68, 68, 0.05); }
        .lock-path { font-family: monospace; word-break: break-all; }
        .lock-holders { display: flex; gap: 4px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}

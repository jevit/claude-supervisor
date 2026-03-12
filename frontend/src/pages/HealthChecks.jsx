import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

export default function HealthChecks() {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newCheck, setNewCheck] = useState({ name: '', command: '', interval: 300000 });

  const fetchChecks = useCallback(() => {
    fetch('/api/health-checks')
      .then((r) => r.json())
      .then((data) => { setChecks(data); setLoading(false); })
      .catch(console.error);
  }, []);

  useEffect(() => { fetchChecks(); }, [fetchChecks]);

  useWebSocket(useCallback((event) => {
    if (event.startsWith('health:')) fetchChecks();
  }, [fetchChecks]));

  const handleAdd = () => {
    fetch('/api/health-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCheck),
    })
      .then(() => { setShowAdd(false); setNewCheck({ name: '', command: '', interval: 300000 }); fetchChecks(); })
      .catch(console.error);
  };

  const handleRun = (name) => {
    fetch(`/api/health-checks/${encodeURIComponent(name)}/run`, { method: 'POST' })
      .then(() => fetchChecks())
      .catch(console.error);
  };

  const handleDelete = (name) => {
    fetch(`/api/health-checks/${encodeURIComponent(name)}`, { method: 'DELETE' })
      .then(() => fetchChecks())
      .catch(console.error);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Health Checks</h1>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Annuler' : 'Ajouter un check'}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <div>
              <label className="form-label">Nom</label>
              <input className="form-input" placeholder="build" value={newCheck.name}
                onChange={(e) => setNewCheck({ ...newCheck, name: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Commande</label>
              <input className="form-input" placeholder="npm run build" value={newCheck.command}
                onChange={(e) => setNewCheck({ ...newCheck, command: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Intervalle (ms)</label>
              <input className="form-input" type="number" value={newCheck.interval}
                onChange={(e) => setNewCheck({ ...newCheck, interval: parseInt(e.target.value, 10) })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn-primary" onClick={handleAdd}>Creer</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement...</span></div>
      ) : checks.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-secondary)' }}>
          Aucun health check configure. Ajoutez-en un pour surveiller le build, les tests, etc.
        </div>
      ) : (
        <div className="checks-grid">
          {checks.map((check) => {
            const r = check.lastResult;
            const statusClass = r ? (r.status === 'pass' ? 'status-active' : 'status-error') : 'status-idle';
            return (
              <div key={check.name} className="card check-card">
                <div className="check-header">
                  <h3>{check.name}</h3>
                  <span className={`status-badge ${statusClass}`}>
                    {r ? r.status : 'jamais lance'}
                  </span>
                </div>
                <p className="check-command">{check.command}</p>
                <p className="check-interval">Intervalle: {Math.round(check.interval / 1000)}s</p>
                {r && (
                  <div className="check-result">
                    <p>Duree: {r.duration}ms</p>
                    {r.output && <pre className="check-output">{r.output}</pre>}
                    {r.error && <pre className="check-output check-error-output">{r.error}</pre>}
                    <p className="check-time">
                      {new Date(r.timestamp).toLocaleString('fr-FR')}
                    </p>
                  </div>
                )}
                <div className="check-actions">
                  <button className="btn-small" onClick={() => handleRun(check.name)}>Lancer</button>
                  <button className="btn-small btn-danger" onClick={() => handleDelete(check.name)}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .btn-primary:hover { background: var(--accent-hover); }
        .form-grid { display: grid; grid-template-columns: 1fr 2fr 1fr auto; gap: 12px; align-items: start; }
        .form-label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .form-input { width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 13px; }
        .checks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }
        .check-card { position: relative; }
        .check-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .check-command { font-family: monospace; font-size: 13px; color: var(--text-secondary); margin-bottom: 4px; }
        .check-interval { font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
        .check-result { margin-bottom: 8px; font-size: 12px; color: var(--text-secondary); }
        .check-output { background: var(--bg-primary); padding: 8px; border-radius: 6px; font-size: 11px; max-height: 100px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin-top: 4px; }
        .check-error-output { color: var(--error); }
        .check-time { margin-top: 4px; font-size: 11px; }
        .check-actions { display: flex; gap: 8px; }
        .btn-small { background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border); padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .btn-small:hover { color: var(--text-primary); border-color: var(--accent); }
        .btn-danger:hover { color: var(--error); border-color: var(--error); }
      `}</style>
    </div>
  );
}

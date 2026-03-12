import React, { useState, useEffect, useCallback } from 'react';

const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'critical'];
const PRIORITY_COLORS = {
  low: '#6b7280',
  normal: '#3b82f6',
  high: '#f97316',
  critical: '#ef4444',
};

function LoadBar({ load }) {
  const color = load > 80 ? '#ef4444' : load > 50 ? '#f97316' : '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${load}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 35 }}>{load}%</span>
    </div>
  );
}

export default function SupervisorMode() {
  const [status, setStatus] = useState(null);
  const [queue, setQueue] = useState([]);
  const [delegations, setDelegations] = useState([]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [preferredSession, setPreferredSession] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [s, q, d] = await Promise.all([
        fetch('/api/supervisor/status').then((r) => r.json()),
        fetch('/api/supervisor/queue').then((r) => r.json()),
        fetch('/api/supervisor/delegations').then((r) => r.json()),
      ]);
      setStatus(s);
      setQueue(Array.isArray(q) ? q : []);
      setDelegations(Array.isArray(d) ? d : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 5000); return () => clearInterval(t); }, [fetchAll]);

  const toggleMode = async () => {
    await fetch('/api/supervisor/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !status?.enabled }),
    });
    fetchAll();
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    await fetch('/api/supervisor/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim(), priority, preferredSession: preferredSession || undefined }),
    });
    setDescription('');
    fetchAll();
  };

  const delegateAll = async () => {
    await fetch('/api/supervisor/delegate-all', { method: 'POST' });
    fetchAll();
  };

  const cancelTask = async (id) => {
    await fetch(`/api/supervisor/queue/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  if (loading) return <div className="card" style={{ textAlign: 'center', padding: 32 }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Mode Superviseur</h2>
        <button className={`btn ${status?.enabled ? 'btn-danger' : 'btn-primary'}`} onClick={toggleMode}>
          {status?.enabled ? 'Desactiver' : 'Activer'} le mode auto
        </button>
      </div>

      {/* Statut global */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: status?.enabled ? '#22c55e' : '#6b7280' }}>
            {status?.enabled ? 'ON' : 'OFF'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mode auto</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{status?.pendingTasks || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>En attente</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>{status?.delegatedTasks || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Deleguees</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{status?.totalDelegations || 0}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total delegations</div>
        </div>
      </div>

      {/* Charge des sessions */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Charge des sessions</h3>
        {(!status?.sessionLoads || status.sessionLoads.length === 0) ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aucune session active</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {status.sessionLoads.map((s) => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</span>
                <LoadBar load={s.load} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.currentTask || 'Libre'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ajouter une tache */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Deleguer une tache</h3>
        <form onSubmit={addTask} style={{ display: 'grid', gap: 10 }}>
          <input
            placeholder="Description de la tache..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="form-input"
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="form-input" style={{ width: 120 }}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={preferredSession} onChange={(e) => setPreferredSession(e.target.value)} className="form-input" style={{ flex: 1 }}>
              <option value="">Session auto</option>
              {(status?.sessionLoads || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.load}%)</option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">Deleguer</button>
          </div>
        </form>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>File d'attente ({queue.filter((t) => t.status === 'pending').length} en attente)</h3>
        <button className="btn btn-secondary" onClick={delegateAll}>Deleguer tout</button>
      </div>

      {queue.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>Aucune tache</div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
          {queue.map((task) => (
            <div key={task.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13 }}>{task.description}</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority], fontWeight: 600 }}>{task.priority}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{task.status}</span>
                  {task.delegatedTo && <span style={{ fontSize: 11, color: 'var(--accent)' }}>→ {task.delegatedTo.substring(0, 8)}</span>}
                </div>
              </div>
              {task.status === 'pending' && (
                <button onClick={() => cancelTask(task.id)} className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 11 }}>
                  Annuler
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Historique des delegations */}
      <h3 style={{ marginBottom: 12 }}>Historique des delegations</h3>
      {delegations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>Aucune delegation</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {delegations.slice(0, 20).map((d) => (
            <div key={d.id} className="card" style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{d.description}</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ color: 'var(--accent)', fontSize: 12 }}>→ {d.sessionName}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{new Date(d.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .form-input { padding: 8px 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 13px; }
        .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); }
        .btn-danger { background: #ef4444; color: white; }
      `}</style>
    </div>
  );
}

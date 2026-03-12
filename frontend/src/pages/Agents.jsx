import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', role: '', systemPrompt: '' });

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => { setAgents(data); setLoading(false); })
      .catch(console.error);
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  useWebSocket(useCallback((event) => {
    if (event.startsWith('agent:')) fetchAgents();
  }, [fetchAgents]));

  const handleCreate = () => {
    if (!newAgent.name || !newAgent.role) return;
    fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAgent),
    })
      .then(() => { setNewAgent({ name: '', role: '', systemPrompt: '' }); setShowAdd(false); fetchAgents(); })
      .catch(console.error);
  };

  const handleDelete = (id) => {
    fetch(`/api/agents/${id}`, { method: 'DELETE' })
      .then(() => fetchAgents())
      .catch(console.error);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Agents</h1>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Annuler' : 'Creer un agent'}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="agent-form">
            <div className="agent-form-row">
              <div>
                <label className="form-label">Nom</label>
                <input className="form-input" placeholder="Reviewer" value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Role</label>
                <input className="form-input" placeholder="Code reviewer" value={newAgent.role}
                  onChange={(e) => setNewAgent({ ...newAgent, role: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="form-label">System prompt (optionnel)</label>
              <textarea className="form-input form-textarea" value={newAgent.systemPrompt}
                placeholder="Instructions specifiques pour cet agent..."
                onChange={(e) => setNewAgent({ ...newAgent, systemPrompt: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={handleCreate}>Creer</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement...</span></div>
      ) : agents.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucun agent configure.</p>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => (
            <div key={agent.id} className="card agent-card">
              <div className="agent-header">
                <h3>{agent.name}</h3>
                <span className={`status-badge status-${agent.status}`}>{agent.status}</span>
              </div>
              <p className="agent-role">{agent.role}</p>
              {agent.systemPrompt && (
                <p className="agent-prompt">{agent.systemPrompt.substring(0, 100)}{agent.systemPrompt.length > 100 ? '...' : ''}</p>
              )}
              <div className="agent-footer">
                <span className="agent-tasks">{agent.taskHistory.length} tache(s)</span>
                <span className="agent-date">Cree le {new Date(agent.createdAt).toLocaleDateString('fr-FR')}</span>
              </div>
              <button className="btn-small btn-danger agent-delete" onClick={() => handleDelete(agent.id)}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .btn-primary:hover { background: var(--accent-hover); }
        .agent-form { display: flex; flex-direction: column; gap: 12px; }
        .agent-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .form-input { width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 13px; }
        .form-textarea { min-height: 60px; resize: vertical; font-family: inherit; }
        .agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .agent-card { position: relative; }
        .agent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .agent-role { font-size: 14px; color: var(--text-secondary); margin-bottom: 8px; }
        .agent-prompt { font-size: 12px; color: var(--text-secondary); background: var(--bg-primary); padding: 8px; border-radius: 6px; margin-bottom: 8px; }
        .agent-footer { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; }
        .agent-delete { position: absolute; top: 16px; right: 16px; }
        .btn-small { background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border); padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .btn-danger:hover { color: var(--error); border-color: var(--error); }
      `}</style>
    </div>
  );
}

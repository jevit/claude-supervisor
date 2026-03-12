import React, { useState, useEffect } from 'react';

export default function Agents() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAgents)
      .catch(console.error);
  }, []);

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Agents</h1>
      {agents.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucun agent configure.</p>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => (
            <div key={agent.id} className="card">
              <h3>{agent.name}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{agent.role}</p>
              <span className={`status-badge status-${agent.status}`}>{agent.status}</span>
              <p style={{ fontSize: 13, marginTop: 8 }}>
                Taches: {agent.taskHistory.length}
              </p>
            </div>
          ))}
        </div>
      )}
      <style>{`
        .agents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
      `}</style>
    </div>
  );
}

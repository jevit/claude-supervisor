import React from 'react';

export default function RecapPanel({ recap }) {
  if (!recap) return null;

  return (
    <div className="card recap-panel">
      <h2>Recap Global</h2>
      <div className="recap-stats">
        <div className="stat">
          <span className="stat-value">{recap.totalSessions}</span>
          <span className="stat-label">Sessions</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-active">{recap.active}</span>
          <span className="stat-label">Actives</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-idle">{recap.idle}</span>
          <span className="stat-label">En attente</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-error">{recap.errored}</span>
          <span className="stat-label">Erreurs</span>
        </div>
      </div>

      <style>{`
        .recap-panel { margin-bottom: 24px; }
        .recap-panel h2 { margin-bottom: 16px; font-size: 20px; }
        .recap-stats {
          display: flex;
          gap: 24px;
        }
        .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: var(--text-primary);
        }
        .stat-active { color: var(--success); }
        .stat-idle { color: var(--text-secondary); }
        .stat-error { color: var(--error); }
        .stat-label {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}

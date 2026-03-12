import React from 'react';

export default function SessionCard({ session }) {
  const statusClass = `status-badge status-${session.status}`;

  return (
    <div className="card session-card">
      <div className="session-header">
        <h3>{session.name}</h3>
        <span className={statusClass}>{session.status}</span>
      </div>
      <p className="session-directory">{session.directory}</p>

      {session.currentTask && (
        <div className="session-task">
          <strong>En cours:</strong> {session.currentTask}
        </div>
      )}

      {session.thinkingState && (
        <div className="session-thinking">
          <strong>Reflexion:</strong> {session.thinkingState}
        </div>
      )}

      {session.recentActions && session.recentActions.length > 0 && (
        <div className="session-actions">
          <strong>Actions recentes:</strong>
          <ul>
            {session.recentActions.map((a, i) => (
              <li key={i}>{a.action}</li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        .session-card { margin-bottom: 16px; }
        .session-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .session-directory {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }
        .session-task, .session-thinking {
          font-size: 14px;
          padding: 8px;
          background: rgba(139, 92, 246, 0.05);
          border-radius: 6px;
          margin-bottom: 8px;
        }
        .session-actions ul {
          list-style: none;
          padding: 0;
          margin-top: 4px;
        }
        .session-actions li {
          font-size: 13px;
          color: var(--text-secondary);
          padding: 2px 0;
        }
      `}</style>
    </div>
  );
}

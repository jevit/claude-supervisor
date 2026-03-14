import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/orchestrator', label: '🎼 Orchestrateur' },
  { to: '/terminals', label: 'Terminaux' },
  { to: '/conflicts', label: 'Conflits & Locks', conflictBadge: true },
  { to: '/context',   label: 'Contexte Partage' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/squads',    label: 'Squad Mode' },
];

export default function Sidebar() {
  const [conflictCount, setConflictCount]       = useState(0);
  const [conflictSeverity, setConflictSeverity] = useState(null); // 'error' | 'warning' | null

  // Polling des conflits toutes les 10s pour le badge
  useEffect(() => {
    const check = () => {
      fetch('/api/conflicts')
        .then((r) => r.json())
        .then((conflicts) => {
          setConflictCount(conflicts.length);
          if (conflicts.length === 0) { setConflictSeverity(null); return; }
          const hasError = conflicts.some((c) => c.severity === 'error');
          setConflictSeverity(hasError ? 'error' : 'warning');
        })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const badgeColor = conflictSeverity === 'error' ? '#ef4444' : '#f59e0b';

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <h1>Claude Supervisor</h1>
      </div>
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
              {item.label}
              {item.conflictBadge && conflictCount > 0 && (
                <span className="conflict-badge" style={{ background: badgeColor }}>
                  {conflictCount}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <style>{`
        .sidebar {
          position: fixed; left: 0; top: 0; width: 240px; height: 100vh;
          background: var(--bg-secondary); border-right: 1px solid var(--border);
          padding: 20px 0; display: flex; flex-direction: column;
        }
        .sidebar-header { padding: 0 20px 20px; border-bottom: 1px solid var(--border); }
        .sidebar-header h1 { font-size: 18px; color: var(--accent); }
        .sidebar-nav { list-style: none; padding: 12px 0; flex: 1; }
        .sidebar-nav a {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 20px; color: var(--text-secondary); text-decoration: none;
          transition: all 0.2s; font-size: 14px;
        }
        .sidebar-nav a:hover, .sidebar-nav a.active {
          color: var(--text-primary); background: rgba(139,92,246,0.1);
          border-right: 3px solid var(--accent);
        }
        .conflict-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; border-radius: 9px;
          font-size: 10px; font-weight: 700; color: white; padding: 0 5px;
        }
      `}</style>
    </nav>
  );
}

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/orchestrator', label: 'Orchestrateur', icon: '🎼' },
  { to: '/terminals',    label: 'Terminaux',        icon: '>_' },
  { to: '/conflicts',    label: 'Conflits & Locks', icon: '⚠', conflictBadge: true },
  { to: '/context',      label: 'Contexte Partage', icon: '📋' },
  { to: '/analytics',    label: 'Analytics',        icon: '📊' },
  { to: '/squads',       label: 'Squad Mode',       icon: '👥' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const [conflictCount, setConflictCount]       = useState(0);
  const [conflictSeverity, setConflictSeverity] = useState(null);

  useEffect(() => {
    const check = () => {
      fetch('/api/conflicts')
        .then((r) => r.json())
        .then((conflicts) => {
          setConflictCount(conflicts.length);
          if (conflicts.length === 0) { setConflictSeverity(null); return; }
          setConflictSeverity(conflicts.some((c) => c.severity === 'error') ? 'error' : 'warning');
        })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const badgeColor = conflictSeverity === 'error' ? '#ef4444' : '#f59e0b';

  return (
    <nav className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      {/* Header : titre + bouton toggle */}
      <div className="sidebar-header">
        {!collapsed && <h1>Claude Supervisor</h1>}
        <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Déplier' : 'Réduire'}>
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {/* Navigation */}
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => isActive ? 'active' : ''} title={collapsed ? item.label : ''}>
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
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
          display: flex; flex-direction: column;
          transition: width 0.25s ease;
          overflow: hidden;
        }
        .sidebar--collapsed { width: 44px; }

        .sidebar-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 12px; border-bottom: 1px solid var(--border);
          min-height: 60px; flex-shrink: 0;
        }
        .sidebar--collapsed .sidebar-header { justify-content: center; padding: 16px 0; }
        .sidebar-header h1 { font-size: 16px; color: var(--accent); margin: 0; white-space: nowrap; overflow: hidden; }

        .sidebar-toggle {
          background: none; border: 1px solid var(--border); border-radius: 5px;
          color: var(--text-secondary); cursor: pointer; font-size: 13px;
          padding: 3px 7px; flex-shrink: 0; transition: all 0.15s;
        }
        .sidebar-toggle:hover { background: rgba(139,92,246,0.15); color: var(--accent); border-color: var(--accent); }

        .sidebar-nav { list-style: none; padding: 8px 0; flex: 1; margin: 0; }
        .sidebar-nav li { overflow: hidden; }
        .sidebar-nav a {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 14px; color: var(--text-secondary); text-decoration: none;
          transition: all 0.15s; font-size: 13px; white-space: nowrap;
        }
        .sidebar--collapsed .sidebar-nav a {
          padding: 10px 0; justify-content: center;
        }
        .sidebar-nav a:hover, .sidebar-nav a.active {
          color: var(--text-primary); background: rgba(139,92,246,0.1);
          border-right: 3px solid var(--accent);
        }

        .nav-icon { font-size: 15px; flex-shrink: 0; font-family: monospace; }
        .nav-label { flex: 1; }

        .conflict-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; border-radius: 9px;
          font-size: 10px; font-weight: 700; color: white; padding: 0 5px;
          flex-shrink: 0;
        }
      `}</style>
    </nav>
  );
}

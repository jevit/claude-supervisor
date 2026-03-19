import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useLivePause } from '../services/websocket';

// Items toujours visibles
const CORE_ITEMS = [
  { to: '/orchestrator', label: 'Orchestrateur',   icon: '🎼', shortcut: 'Alt+6' },
  { to: '/terminals',    label: 'Terminaux',        icon: '🖥', shortcut: 'Alt+1' },
  { to: '/context',      label: 'Contexte Partagé', icon: '📋', shortcut: 'Alt+3' },
  { to: '/squads',       label: 'Squad Mode',       icon: '👥', shortcut: 'Alt+5' },
  { to: '/agents',       label: 'Agents',            icon: '🤖', shortcut: '' },
  { to: '/messages',     label: 'Messages',         icon: '✉',  shortcut: '' },
  { to: '/settings',     label: 'Paramètres',       icon: '⚙', shortcut: '' },
];

// Items activables depuis les paramètres
const OPTIONAL_ITEMS = [
  { to: '/conflicts', label: 'Conflits & Locks', icon: '⚡', conflictBadge: true, shortcut: 'Alt+2', settingKey: 'showConflicts' },
  { to: '/analytics', label: 'Analytics',        icon: '📊', shortcut: 'Alt+4', settingKey: 'showAnalytics' },
  { to: '/timeline',  label: 'Journal',          icon: '📜', shortcut: '',       settingKey: 'showJournal' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const [errorCount,   setErrorCount]   = useState(0); // conflits critiques (#32)
  const [warningCount, setWarningCount] = useState(0); // conflits warnings (#32)
  const [modules,      setModules]      = useState({}); // paramètres modules optionnels
  const { paused, setPaused } = useLivePause();

  // Charger les paramètres pour savoir quels modules afficher
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setModules({ showConflicts: s.showConflicts, showAnalytics: s.showAnalytics, showJournal: s.showJournal }))
      .catch(() => {});
  }, []);

  // Écouter les changements de paramètres via CustomEvent
  useEffect(() => {
    const handler = (e) => {
      const s = e.detail || {};
      setModules({ showConflicts: s.showConflicts, showAnalytics: s.showAnalytics, showJournal: s.showJournal });
    };
    window.addEventListener('settings:updated', handler);
    return () => window.removeEventListener('settings:updated', handler);
  }, []);

  const visibleOptional = OPTIONAL_ITEMS.filter((item) => modules[item.settingKey]);
  const navItems = [...CORE_ITEMS, ...visibleOptional].sort((a, b) => {
    // Maintenir Paramètres en dernier
    if (a.to === '/settings') return 1;
    if (b.to === '/settings') return -1;
    return 0;
  });

  useEffect(() => {
    if (!modules.showConflicts) { setErrorCount(0); setWarningCount(0); return; }
    const check = () => {
      fetch('/api/conflicts')
        .then((r) => r.json())
        .then((conflicts) => {
          setErrorCount(conflicts.filter((c) => c.severity === 'error').length);
          setWarningCount(conflicts.filter((c) => c.severity === 'warning').length);
        })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, [modules.showConflicts]);

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
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => isActive ? 'active' : ''}
              title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && (
                <span className="nav-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
                  <span>{item.label}</span>
                  {item.shortcut && <kbd style={{ fontSize: 9, opacity: 0.35, fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '1px 4px' }}>{item.shortcut}</kbd>}
                </span>
              )}
              {item.conflictBadge && errorCount > 0 && (
                <span className="conflict-badge" style={{ background: '#ef4444' }} title={`${errorCount} conflit(s) critique(s)`}>
                  {errorCount}
                </span>
              )}
              {item.conflictBadge && warningCount > 0 && (
                <span className="conflict-badge" style={{ background: '#f59e0b', marginLeft: errorCount > 0 ? 2 : 0 }} title={`${warningCount} avertissement(s)`}>
                  {warningCount}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Footer : toggle activité live */}
      <div
        className="sidebar-live-toggle"
        title={paused ? 'Activité live en pause' : 'Activité live active'}
        onClick={() => setPaused(!paused)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setPaused(!paused)}
      >
        <span className={`live-dot${paused ? ' live-dot--paused' : ''}`} />
        {!collapsed && (
          <span className="live-label">
            Live
            <input
              type="checkbox"
              checked={!paused}
              onChange={(e) => setPaused(!e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{ marginLeft: 'auto', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </span>
        )}
      </div>

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

        .sidebar-live-toggle {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-top: 1px solid var(--border);
          cursor: pointer; user-select: none;
          color: var(--text-secondary); font-size: 12px;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .sidebar--collapsed .sidebar-live-toggle { justify-content: center; padding: 10px 0; }
        .sidebar-live-toggle:hover { background: rgba(139,92,246,0.08); }

        .live-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
          background: #22c55e;
          box-shadow: 0 0 6px #22c55e;
          animation: live-pulse 2s ease-in-out infinite;
        }
        .live-dot--paused {
          background: var(--text-secondary);
          box-shadow: none;
          animation: none;
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .live-label {
          display: flex; align-items: center; gap: 6px; flex: 1;
        }
      `}</style>
    </nav>
  );
}

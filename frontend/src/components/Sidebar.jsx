import React from 'react';
import { NavLink } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/agents', label: 'Agents' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/conflicts', label: 'Conflits & Locks' },
  { to: '/health', label: 'Health Checks' },
  { to: '/context', label: 'Contexte Partage' },
  { to: '/messages', label: 'Messages' },
];

export default function Sidebar() {
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
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <NotificationCenter />
      </div>
      <style>{`
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          width: 240px;
          height: 100vh;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border);
          padding: 20px 0;
          display: flex;
          flex-direction: column;
        }
        .sidebar-header {
          padding: 0 20px 20px;
          border-bottom: 1px solid var(--border);
        }
        .sidebar-header h1 {
          font-size: 18px;
          color: var(--accent);
        }
        .sidebar-nav {
          list-style: none;
          padding: 12px 0;
          flex: 1;
        }
        .sidebar-nav a {
          display: block;
          padding: 10px 20px;
          color: var(--text-secondary);
          text-decoration: none;
          transition: all 0.2s;
          font-size: 14px;
        }
        .sidebar-nav a:hover,
        .sidebar-nav a.active {
          color: var(--text-primary);
          background: rgba(139, 92, 246, 0.1);
          border-right: 3px solid var(--accent);
        }
        .sidebar-footer {
          border-top: 1px solid var(--border);
        }
      `}</style>
    </nav>
  );
}

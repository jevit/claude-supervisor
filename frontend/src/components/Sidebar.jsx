import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <h1>Claude Supervisor</h1>
      </div>
      <ul className="sidebar-nav">
        <li>
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
            Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to="/agents" className={({ isActive }) => isActive ? 'active' : ''}>
            Agents
          </NavLink>
        </li>
      </ul>
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
        }
        .sidebar-nav a {
          display: block;
          padding: 10px 20px;
          color: var(--text-secondary);
          text-decoration: none;
          transition: all 0.2s;
        }
        .sidebar-nav a:hover,
        .sidebar-nav a.active {
          color: var(--text-primary);
          background: rgba(139, 92, 246, 0.1);
          border-right: 3px solid var(--accent);
        }
      `}</style>
    </nav>
  );
}

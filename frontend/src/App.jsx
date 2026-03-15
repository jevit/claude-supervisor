import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Conflicts from './pages/Conflicts';
import SharedContext from './pages/SharedContext';
import Analytics from './pages/Analytics';
import Terminals from './pages/Terminals';
import SquadLauncher from './pages/SquadLauncher';
import SquadView from './pages/SquadView';
import Orchestrator from './pages/Orchestrator';
import Settings from './pages/Settings';
import Timeline from './pages/Timeline';
import Messages from './pages/Messages';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';

// Pages accessibles par Alt+chiffre
const NAV_SHORTCUTS = [
  '/terminals', '/conflicts', '/context', '/analytics', '/squads', '/orchestrator',
];

// Modal d'aide raccourcis (#61)
function ShortcutsModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#1f2335', border: '1px solid #2a2b3d', borderRadius: 12, padding: '24px 32px', minWidth: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, color: '#c0caf5' }}>Raccourcis clavier</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        {[
          ['Alt + 1', 'Terminaux'],
          ['Alt + 2', 'Conflits & Locks'],
          ['Alt + 3', 'Contexte partagé'],
          ['Alt + 4', 'Analytics'],
          ['Alt + 5', 'Squads'],
          ['Alt + 6', 'Orchestrateur'],
          ['Alt + T', 'Nouveau terminal (depuis n\'importe quelle page)'],
          ['Ctrl + F', 'Rechercher dans le terminal'],
          ['↑ / ↓ + Enter', 'Naviguer dans la liste'],
          ['?', 'Cette aide'],
          ['Échap', 'Fermer / Annuler'],
        ].map(([key, label]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #2a2b3d' }}>
            <kbd style={{ background: '#1a1b26', border: '1px solid #2a2b3d', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontFamily: 'monospace', color: '#8b5cf6' }}>{key}</kbd>
            <span style={{ fontSize: 13, color: '#a9b1d6' }}>{label}</span>
          </div>
        ))}
        <p style={{ fontSize: 11, color: '#565f89', marginTop: 12, marginBottom: 0 }}>Appuyez sur ? ou Échap pour fermer</p>
      </div>
    </div>
  );
}

function GlobalShortcuts({ onShowHelp }) {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e) => {
      // Ignorer si l'utilisateur tape dans un input/textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === '?') { onShowHelp(); return; }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // Alt+T : ouvrir le formulaire de création de terminal (#1)
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        navigate('/terminals?create=1');
        return;
      }
      const n = parseInt(e.key);
      if (n >= 1 && n <= NAV_SHORTCUTS.length) {
        e.preventDefault();
        navigate(NAV_SHORTCUTS[n - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onShowHelp]);
  return null;
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [showHelp, setShowHelp]   = useState(false);

  return (
    <ToastProvider>
    <div className="app-layout">
      <GlobalShortcuts onShowHelp={() => setShowHelp(true)} />
      {showHelp && <ShortcutsModal onClose={() => setShowHelp(false)} />}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <main className={`main-content${collapsed ? ' sidebar-collapsed' : ''}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/terminals" replace />} />
          <Route path="/conflicts" element={<Conflicts />} />
          <Route path="/context" element={<SharedContext />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/terminals" element={<Terminals />} />
          <Route path="/squads" element={<SquadLauncher />} />
          <Route path="/squads/:id" element={<SquadView />} />
          <Route path="/orchestrator" element={<Orchestrator />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/messages" element={<Messages />} />
        </Routes>
      </main>
    </div>
    </ToastProvider>
  );
}

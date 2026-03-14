import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Conflicts from './pages/Conflicts';
import SharedContext from './pages/SharedContext';
import Analytics from './pages/Analytics';
import Terminals from './pages/Terminals';
import SquadLauncher from './pages/SquadLauncher';
import SquadView from './pages/SquadView';
import Orchestrator from './pages/Orchestrator';
import Sidebar from './components/Sidebar';

export default function App() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="app-layout">
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
        </Routes>
      </main>
    </div>
  );
}

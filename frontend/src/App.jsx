import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Timeline from './pages/Timeline';
import Conflicts from './pages/Conflicts';
import HealthChecks from './pages/HealthChecks';
import SharedContext from './pages/SharedContext';
import Messages from './pages/Messages';
import Sidebar from './components/Sidebar';

export default function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/conflicts" element={<Conflicts />} />
          <Route path="/health" element={<HealthChecks />} />
          <Route path="/context" element={<SharedContext />} />
          <Route path="/messages" element={<Messages />} />
        </Routes>
      </main>
    </div>
  );
}

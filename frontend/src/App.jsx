import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Timeline from './pages/Timeline';
import Conflicts from './pages/Conflicts';
import HealthChecks from './pages/HealthChecks';
import SharedContext from './pages/SharedContext';
import Messages from './pages/Messages';
import Irritants from './pages/Irritants';
import AlertRules from './pages/AlertRules';
import Analytics from './pages/Analytics';
import SupervisorModePage from './pages/SupervisorMode';
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
          <Route path="/irritants" element={<Irritants />} />
          <Route path="/alerts" element={<AlertRules />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/supervisor" element={<SupervisorModePage />} />
        </Routes>
      </main>
    </div>
  );
}

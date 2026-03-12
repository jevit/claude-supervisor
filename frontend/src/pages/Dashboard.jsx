import React, { useState, useEffect, useCallback } from 'react';
import RecapPanel from '../components/RecapPanel';
import SessionCard from '../components/SessionCard';
import ConnectionBanner from '../components/ConnectionBanner';
import MiniTimeline from '../components/MiniTimeline';
import { useWebSocket } from '../services/websocket';

export default function Dashboard() {
  const [recap, setRecap] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const handleMessage = useCallback((event, data) => {
    if (event === 'init' && data?.recap) {
      setRecap(data.recap);
      setSessions(data.recap.sessions || []);
      setLoaded(true);
      return;
    }

    if (event === 'session:updated' || event === 'session:registered') {
      setSessions((prev) => {
        const idx = prev.findIndex((s) => s.id === data.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [...prev, data];
      });
      fetch('/api/sessions/recap')
        .then((r) => r.json())
        .then(setRecap)
        .catch(console.error);
    }

    if (event === 'session:removed') {
      setSessions((prev) => prev.filter((s) => s.id !== data.id));
      fetch('/api/sessions/recap')
        .then((r) => r.json())
        .then(setRecap)
        .catch(console.error);
    }
  }, []);

  const { connectionState } = useWebSocket(handleMessage);

  return (
    <div>
      <ConnectionBanner state={connectionState} />
      <h1 style={{ marginBottom: 24 }}>Dashboard</h1>
      <RecapPanel recap={recap} loading={!loaded} />

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <h2 style={{ marginBottom: 16 }}>Sessions Actives</h2>
          {!loaded ? (
            <div className="loading-placeholder">
              <div className="loading-spinner" />
              <span>Chargement des sessions...</span>
            </div>
          ) : sessions.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Aucune session active.</p>
          ) : (
            sessions.map((s) => <SessionCard key={s.id} session={s} />)
          )}
        </div>
        <div className="dashboard-sidebar">
          <MiniTimeline />
        </div>
      </div>

      <style>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
        }
        @media (max-width: 1200px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

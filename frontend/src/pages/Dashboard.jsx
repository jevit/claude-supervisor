import React, { useState, useEffect } from 'react';
import RecapPanel from '../components/RecapPanel';
import SessionCard from '../components/SessionCard';
import { useWebSocket } from '../services/websocket';

export default function Dashboard() {
  const [recap, setRecap] = useState(null);
  const [sessions, setSessions] = useState([]);

  // Fetch initial recap
  useEffect(() => {
    fetch('/api/sessions/recap')
      .then((r) => r.json())
      .then(setRecap)
      .catch(console.error);
  }, []);

  // Real-time updates via WebSocket
  useWebSocket((event, data) => {
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
    }
    if (event === 'session:removed') {
      setSessions((prev) => prev.filter((s) => s.id !== data.id));
    }
    if (event.startsWith('session:')) {
      // Refresh recap on any session change
      fetch('/api/sessions/recap')
        .then((r) => r.json())
        .then(setRecap)
        .catch(console.error);
    }
  });

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Dashboard</h1>
      <RecapPanel recap={recap} />
      <h2 style={{ marginBottom: 16 }}>Sessions Actives</h2>
      {sessions.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucune session active.</p>
      ) : (
        sessions.map((s) => <SessionCard key={s.id} session={s} />)
      )}
    </div>
  );
}

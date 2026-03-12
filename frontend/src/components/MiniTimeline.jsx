import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';
import { Link } from 'react-router-dom';

const EVENT_COLORS = {
  'session:registered': 'var(--success)',
  'session:updated': 'var(--accent)',
  'session:removed': 'var(--warning)',
  'agent:created': 'var(--success)',
  'task:completed': 'var(--success)',
  'task:failed': 'var(--error)',
  'health:fail': 'var(--error)',
  'conflict:detected': 'var(--warning)',
  'env:changed': 'var(--warning)',
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventLabel(type) {
  const parts = type.split(':');
  return parts[parts.length - 1];
}

export default function MiniTimeline() {
  const [events, setEvents] = useState([]);

  const fetchEvents = useCallback(() => {
    fetch('/api/timeline?limit=15')
      .then((r) => r.json())
      .then(setEvents)
      .catch(console.error);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useWebSocket(useCallback((event) => {
    if (event !== 'init' && event !== 'notification:new') fetchEvents();
  }, [fetchEvents]));

  return (
    <div className="mini-timeline">
      <div className="mini-timeline-header">
        <h3>Activite recente</h3>
        <Link to="/timeline" className="mini-timeline-link">Tout voir</Link>
      </div>
      {events.length === 0 ? (
        <p className="mini-empty">Aucune activite</p>
      ) : (
        events.map((evt) => (
          <div key={evt.id} className="mini-event">
            <div className="mini-dot" style={{ background: EVENT_COLORS[evt.type] || 'var(--text-secondary)' }} />
            <div className="mini-content">
              <span className="mini-type">{eventLabel(evt.type)}</span>
              <span className="mini-time">{formatTime(evt.timestamp)}</span>
            </div>
          </div>
        ))
      )}
      <style>{`
        .mini-timeline {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
        }
        .mini-timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .mini-timeline-header h3 { font-size: 15px; }
        .mini-timeline-link { font-size: 12px; color: var(--accent); text-decoration: none; }
        .mini-timeline-link:hover { text-decoration: underline; }
        .mini-empty { font-size: 13px; color: var(--text-secondary); }
        .mini-event {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 5px 0;
          border-left: 2px solid var(--border);
          margin-left: 4px;
          padding-left: 12px;
          position: relative;
        }
        .mini-dot {
          position: absolute;
          left: -4px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .mini-content {
          display: flex;
          justify-content: space-between;
          flex: 1;
        }
        .mini-type { font-size: 12px; color: var(--text-primary); text-transform: capitalize; }
        .mini-time { font-size: 11px; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}

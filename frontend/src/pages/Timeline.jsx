import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

const EVENT_LABELS = {
  'session:registered': 'Session enregistree',
  'session:updated': 'Session mise a jour',
  'session:removed': 'Session supprimee',
  'agent:created': 'Agent cree',
  'agent:removed': 'Agent supprime',
  'task:started': 'Tache demarree',
  'task:completed': 'Tache terminee',
  'task:failed': 'Tache echouee',
};

const EVENT_COLORS = {
  'session:registered': 'var(--success)',
  'session:updated': 'var(--accent)',
  'session:removed': 'var(--warning)',
  'agent:created': 'var(--success)',
  'agent:removed': 'var(--warning)',
  'task:started': 'var(--accent)',
  'task:completed': 'var(--success)',
  'task:failed': 'var(--error)',
};

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function EventItem({ event }) {
  const color = EVENT_COLORS[event.type] || 'var(--text-secondary)';
  const label = EVENT_LABELS[event.type] || event.type;

  // Description contextuelle basee sur les donnees
  let description = '';
  const d = event.data || {};
  if (d.name) description = d.name;
  if (d.currentTask) description += description ? ` — ${d.currentTask}` : d.currentTask;
  if (d.error) description += description ? ` (${d.error})` : d.error;
  if (d.status && !d.name) description = `Statut: ${d.status}`;

  return (
    <div className="timeline-event">
      <div className="timeline-dot" style={{ background: color }} />
      <div className="timeline-content">
        <div className="timeline-header">
          <span className="timeline-label" style={{ color }}>{label}</span>
          <span className="timeline-time">{formatTime(event.timestamp)}</span>
        </div>
        {description && <p className="timeline-desc">{description}</p>}
        <span className="timeline-source">{event.source}</span>
      </div>
    </div>
  );
}

export default function Timeline() {
  const [events, setEvents] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (typeFilter) params.set('type', typeFilter);

    fetch(`/api/timeline?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch(console.error);
  }, [typeFilter]);

  useEffect(() => {
    fetchEvents();
    fetch('/api/timeline/types')
      .then((r) => r.json())
      .then(setEventTypes)
      .catch(console.error);
  }, [fetchEvents]);

  // Rafraichir quand un evenement arrive en temps reel
  useWebSocket(useCallback((event) => {
    if (event !== 'init') {
      fetchEvents();
    }
  }, [fetchEvents]));

  // Grouper par date
  const grouped = {};
  for (const evt of events) {
    const date = formatDate(evt.timestamp);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(evt);
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Timeline</h1>

      <div className="timeline-filters">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="timeline-select"
        >
          <option value="">Tous les evenements</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{EVENT_LABELS[t] || t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-placeholder">
          <div className="loading-spinner" />
          <span>Chargement de la timeline...</span>
        </div>
      ) : events.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Aucun evenement enregistre.</p>
      ) : (
        Object.entries(grouped).map(([date, evts]) => (
          <div key={date} className="timeline-group">
            <div className="timeline-date">{date}</div>
            {evts.map((evt) => (
              <EventItem key={evt.id} event={evt} />
            ))}
          </div>
        ))
      )}

      <style>{`
        .timeline-filters {
          margin-bottom: 20px;
        }
        .timeline-select {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 14px;
          cursor: pointer;
        }
        .timeline-group {
          margin-bottom: 24px;
        }
        .timeline-date {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }
        .timeline-event {
          display: flex;
          gap: 12px;
          padding: 10px 0;
          border-left: 2px solid var(--border);
          margin-left: 6px;
          padding-left: 16px;
          position: relative;
        }
        .timeline-dot {
          position: absolute;
          left: -5px;
          top: 14px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .timeline-content {
          flex: 1;
          min-width: 0;
        }
        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2px;
        }
        .timeline-label {
          font-size: 14px;
          font-weight: 600;
        }
        .timeline-time {
          font-size: 12px;
          color: var(--text-secondary);
          flex-shrink: 0;
        }
        .timeline-desc {
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .timeline-source {
          font-size: 11px;
          color: var(--border);
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}

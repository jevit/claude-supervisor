import React, { useState, useEffect, useCallback, useRef } from 'react';
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

function eventDetail(evt) {
  const d = evt.data || {};
  if (d.name)      return d.name;
  if (d.memberName) return d.memberName;
  if (d.file)      return d.file.split('/').pop();
  if (d.key)       return d.key;
  if (d.from && d.to) return `${d.from.substring(0,6)}→${d.to.substring(0,6)}`;
  if (d.sessionId) return d.sessionId.substring(0, 8);
  if (d.terminalId) return d.terminalId.substring(0, 8);
  return null;
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

  // Nettoyage du timer debounce au démontage
  const debounceRef = useRef(null);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  useWebSocket(useCallback((event) => {
    // Debounce 500ms pour éviter le flood sur terminal:output
    if (event !== 'init' && event !== 'notification:new') {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchEvents, 500);
    }
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
        events.map((evt) => {
          const detail = eventDetail(evt);
          return (
            <div key={evt.id} className="mini-event">
              <div className="mini-dot" style={{ background: EVENT_COLORS[evt.type] || 'var(--text-secondary)' }} />
              <div className="mini-content">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span className="mini-type">{eventLabel(evt.type)}</span>
                  {detail && <span className="mini-detail">{detail}</span>}
                </div>
                <span className="mini-time">{formatTime(evt.timestamp)}</span>
              </div>
            </div>
          );
        })
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
        .mini-detail { font-size: 10px; color: var(--text-secondary); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
        .mini-time { font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
      `}</style>
    </div>
  );
}

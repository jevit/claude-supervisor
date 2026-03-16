import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../services/websocket';

// Couleur par catégorie d'event
export function eventColor(type) {
  if (type.startsWith('session:'))  return '#8b5cf6';
  if (type.startsWith('terminal:')) return '#22d3ee';
  if (type.startsWith('squad:'))    return '#f59e0b';
  if (type.startsWith('lock:'))     return '#ef4444';
  if (type.startsWith('conflict:')) return '#f97316';
  if (type.startsWith('context:'))  return '#10b981';
  if (type.startsWith('message:'))  return '#3b82f6';
  if (type.startsWith('health:'))   return '#84cc16';
  return '#565f89';
}

export default function Timeline() {
  const [events,      setEvents]      = useState([]);
  const [types,       setTypes]       = useState([]);
  const [sources,     setSources]     = useState([]);
  const [typeFilter,  setTypeFilter]  = useState('');
  const [srcFilter,   setSrcFilter]   = useState('');
  const [loading,     setLoading]     = useState(true);
  const [limit,       setLimit]       = useState(100);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ limit });
    if (typeFilter) params.set('type', typeFilter);
    if (srcFilter)  params.set('source', srcFilter);

    const [eventsRes, typesRes, sourcesRes] = await Promise.all([
      fetch(`/api/timeline?${params}`).then((r) => r.json()).catch(() => []),
      fetch('/api/timeline/types').then((r) => r.json()).catch(() => []),
      fetch('/api/timeline/sources').then((r) => r.json()).catch(() => []),
    ]);
    setEvents(eventsRes);
    setTypes(typesRes);
    setSources(sourcesRes);
    setLoading(false);
  }, [typeFilter, srcFilter, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Nettoyage du timer debounce au démontage
  const debounceRef = useRef(null);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  useWebSocket(useCallback((event) => {
    // Debounce 500ms pour éviter le flood sur terminal:output
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchData, 500);
  }, [fetchData]));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Journal d'événements</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
            {events.length} événement{events.length !== 1 ? 's' : ''}
            {(typeFilter || srcFilter) && ' (filtré)'}
          </p>
        </div>
        <button
          onClick={fetchData}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}
        >
          ↻ Rafraîchir
        </button>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ background: 'var(--bg-primary)', border: `1px solid ${typeFilter ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, padding: '5px 10px', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">Tous les types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={srcFilter}
          onChange={(e) => setSrcFilter(e.target.value)}
          style={{ background: 'var(--bg-primary)', border: `1px solid ${srcFilter ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, padding: '5px 10px', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', maxWidth: 220 }}
        >
          <option value="">Toutes les sources</option>
          {sources.map((s) => <option key={s} value={s}>{s.length > 28 ? s.slice(0, 26) + '…' : s}</option>)}
        </select>

        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}
        >
          <option value={50}>50 événements</option>
          <option value={100}>100 événements</option>
          <option value={250}>250 événements</option>
          <option value={500}>500 événements</option>
        </select>

        {(typeFilter || srcFilter) && (
          <button
            onClick={() => { setTypeFilter(''); setSrcFilter(''); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
          >
            ✕ Effacer filtres
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement…</span></div>
      ) : events.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 32 }}>
          Aucun événement{typeFilter || srcFilter ? ' pour ce filtre' : ''}.
        </div>
      ) : (
        <div className="tl-list">
          {events.map((ev) => (
            <div key={ev.id} className="tl-row">
              <div className="tl-dot" style={{ background: eventColor(ev.type) }} />
              <div className="tl-body">
                <div className="tl-top">
                  <span className="tl-type" style={{ color: eventColor(ev.type) }}>{ev.type}</span>
                  <span className="tl-source" onClick={() => setSrcFilter(ev.source === srcFilter ? '' : ev.source)} title="Filtrer par cette source">
                    {ev.source}
                  </span>
                  <span className="tl-time">{new Date(ev.timestamp).toLocaleTimeString('fr-FR')}</span>
                </div>
                {ev.data && Object.keys(ev.data).length > 0 && (
                  <div className="tl-data">
                    {Object.entries(ev.data)
                      .filter(([, v]) => v !== null && v !== undefined && v !== '')
                      .map(([k, v]) => (
                        <span key={k} className="tl-kv">
                          <span className="tl-k">{k}</span>
                          <span className="tl-v">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </span>
                      ))}
                  </div>
                )}
              </div>
              <div className="tl-date" title={new Date(ev.timestamp).toLocaleString('fr-FR')}>
                {new Date(ev.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .tl-list { display: flex; flex-direction: column; gap: 0; }
        .tl-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .tl-row:hover { background: rgba(139,92,246,0.04); }
        .tl-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
        .tl-body { flex: 1; min-width: 0; }
        .tl-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .tl-type { font-size: 12px; font-weight: 600; font-family: monospace; white-space: nowrap; }
        .tl-source { font-size: 11px; color: var(--text-secondary); font-family: monospace; background: var(--bg-secondary); border-radius: 4px; padding: 1px 6px; cursor: pointer; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tl-source:hover { color: var(--accent); border-color: var(--accent); }
        .tl-time { font-size: 11px; color: var(--text-secondary); font-family: monospace; }
        .tl-data { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .tl-kv { display: inline-flex; gap: 4px; font-size: 11px; background: var(--bg-secondary); border-radius: 4px; padding: 1px 6px; }
        .tl-k { color: var(--text-secondary); }
        .tl-v { color: var(--text-primary); font-family: monospace; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tl-date { font-size: 10px; color: #565f89; flex-shrink: 0; align-self: center; }
      `}</style>
    </div>
  );
}

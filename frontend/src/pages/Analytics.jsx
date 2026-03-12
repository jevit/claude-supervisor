import React, { useState, useEffect } from 'react';

/**
 * Page Analytics - Vue historique et statistiques des sessions.
 * Affiche des graphiques textuels (ASCII bar charts) pour garder
 * la simplicite sans dependance chart.
 */

function BarChart({ data, maxWidth = 200, color = 'var(--accent)' }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 80, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>
            {d.label}
          </span>
          <div style={{
            width: Math.max(2, (d.value / max) * maxWidth),
            height: 18,
            background: color,
            borderRadius: 3,
            opacity: 0.8,
            transition: 'width 0.3s',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [sessions, setSessions] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [healthChecks, setHealthChecks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/sessions').then((r) => r.json()),
      fetch('/api/timeline?limit=500').then((r) => r.json()),
      fetch('/api/health-checks').then((r) => r.json()),
    ]).then(([sess, tl, hc]) => {
      setSessions(Array.isArray(sess) ? sess : []);
      setTimeline(Array.isArray(tl) ? tl : []);
      setHealthChecks(Array.isArray(hc) ? hc : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="card" style={{ textAlign: 'center', padding: 32 }}>Chargement...</div>;

  // Stats sessions par statut
  const statusCounts = {};
  for (const s of sessions) {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  }

  // Activite par heure (derniere 24h)
  const hourActivity = new Array(24).fill(0);
  const now = Date.now();
  for (const ev of timeline) {
    const age = now - new Date(ev.timestamp).getTime();
    if (age < 86400000) {
      const hour = new Date(ev.timestamp).getHours();
      hourActivity[hour]++;
    }
  }

  // Evenements par type
  const typeCounts = {};
  for (const ev of timeline) {
    const type = (ev.event || ev.type || '').split(':')[0];
    if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  // Sessions les plus actives (par nb d'actions dans l'historique)
  const sessionActivity = sessions
    .map((s) => ({ label: s.name || s.id?.substring(0, 8), value: s.history?.length || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Health check resultats
  const hcResults = healthChecks.map((hc) => ({
    label: hc.name,
    value: hc.lastResult?.success ? 1 : 0,
    status: hc.lastResult?.success ? 'OK' : 'FAIL',
  }));

  // Duree moyenne des sessions
  const durations = sessions
    .filter((s) => s.startedAt)
    .map((s) => {
      const start = new Date(s.startedAt).getTime();
      const end = s.lastUpdate ? new Date(s.lastUpdate).getTime() : now;
      return (end - start) / 60000; // minutes
    });
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return (
    <div>
      <h2>Analytics & Historique</h2>

      {/* Metriques cles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>{sessions.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sessions totales</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{statusCounts.active || 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Actives</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#eab308' }}>{timeline.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Evenements</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{avgDuration}min</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Duree moy. session</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Activite par heure */}
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Activite par heure (24h)</h3>
          <BarChart
            data={hourActivity.map((v, h) => ({ label: `${String(h).padStart(2, '0')}h`, value: v }))}
            color="#8b5cf6"
          />
        </div>

        {/* Evenements par type */}
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Evenements par type</h3>
          <BarChart
            data={Object.entries(typeCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([label, value]) => ({ label, value }))}
            color="#3b82f6"
          />
        </div>

        {/* Sessions les plus actives */}
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Sessions les plus actives</h3>
          {sessionActivity.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aucune session</p>
          ) : (
            <BarChart data={sessionActivity} color="#22c55e" />
          )}
        </div>

        {/* Health checks */}
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Health Checks</h3>
          {hcResults.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Aucun health check configure</p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {hcResults.map((hc, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontSize: 13 }}>{hc.label}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: hc.status === 'OK' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: hc.status === 'OK' ? '#22c55e' : '#ef4444',
                  }}>
                    {hc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Historique des sessions */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Historique des sessions</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Nom</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Statut</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Repertoire</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Actions</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-secondary)' }}>Derniere MAJ</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>{s.name}</td>
                <td style={{ padding: '6px 8px' }}>
                  <span className={`status-badge status-${s.status}`}>{s.status}</span>
                </td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.directory}
                </td>
                <td style={{ padding: '6px 8px' }}>{s.history?.length || 0}</td>
                <td style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-secondary)' }}>
                  {s.lastUpdate ? new Date(s.lastUpdate).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

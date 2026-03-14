import React, { useState, useEffect } from 'react';

/**
 * Page Analytics - Vue historique et statistiques des sessions.
 * Affiche des graphiques textuels (ASCII bar charts) pour garder
 * la simplicite sans dependance chart.
 */

function BarChart({ data, maxWidth = 200, color = 'var(--accent)' }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-row">
          <span className="bar-label">
            {d.label}
          </span>
          <div
            className="bar-fill"
            style={{
              width: Math.max(2, (d.value / max) * maxWidth),
              background: color,
            }}
          />
          <span className="bar-value">{d.value}</span>
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

  if (loading) return <div className="card analytics-loading">Chargement...</div>;

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
    <div className="analytics-page">
      <h2 className="analytics-header">Analytics & Historique</h2>

      {/* Metriques cles */}
      <div className="metrics-grid">
        <div className="card metric-card">
          <div className="metric-value accent">{sessions.length}</div>
          <div className="metric-label">Sessions totales</div>
        </div>
        <div className="card metric-card">
          <div className="metric-value success">{statusCounts.active || 0}</div>
          <div className="metric-label">Actives</div>
        </div>
        <div className="card metric-card">
          <div className="metric-value warning">{timeline.length}</div>
          <div className="metric-label">Evenements</div>
        </div>
        <div className="card metric-card">
          <div className="metric-value info">{avgDuration}min</div>
          <div className="metric-label">Duree moy. session</div>
        </div>
      </div>

      <div className="charts-grid">
        {/* Activite par heure */}
        <div className="card chart-container">
          <h3 className="chart-title">Activite par heure (24h)</h3>
          <BarChart
            data={hourActivity.map((v, h) => ({ label: `${String(h).padStart(2, '0')}h`, value: v }))}
            color="var(--accent)"
          />
        </div>

        {/* Evenements par type */}
        <div className="card chart-container">
          <h3 className="chart-title">Evenements par type</h3>
          <BarChart
            data={Object.entries(typeCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10)
              .map(([label, value]) => ({ label, value }))}
            color="#3b82f6"
          />
        </div>

        {/* Sessions les plus actives */}
        <div className="card chart-container">
          <h3 className="chart-title">Sessions les plus actives</h3>
          {sessionActivity.length === 0 ? (
            <p className="empty-message">Aucune session</p>
          ) : (
            <BarChart data={sessionActivity} color="var(--success)" />
          )}
        </div>

        {/* Health checks */}
        <div className="card chart-container">
          <h3 className="chart-title">Health Checks</h3>
          {hcResults.length === 0 ? (
            <p className="empty-message">Aucun health check configure</p>
          ) : (
            <div className="hc-list">
              {hcResults.map((hc, i) => (
                <div key={i} className="hc-row">
                  <span className="hc-name">{hc.label}</span>
                  <span className={`hc-badge hc-${hc.status.toLowerCase()}`}>
                    {hc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Historique des sessions */}
      <div className="card history-section">
        <h3 className="chart-title">Historique des sessions</h3>
        <table className="history-table">
          <thead>
            <tr className="history-thead-row">
              <th className="history-th">Nom</th>
              <th className="history-th">Statut</th>
              <th className="history-th">Repertoire</th>
              <th className="history-th">Actions</th>
              <th className="history-th">Derniere MAJ</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="history-row">
                <td className="history-td">{s.name}</td>
                <td className="history-td">
                  <span className={`status-badge status-${s.status}`}>{s.status}</span>
                </td>
                <td className="history-td history-td-dir">
                  {s.directory}
                </td>
                <td className="history-td">{s.history?.length || 0}</td>
                <td className="history-td history-td-date">
                  {s.lastUpdate ? new Date(s.lastUpdate).toLocaleString() : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Styles scopes pour la page Analytics */}
      <style>{`
        .analytics-page { }
        .analytics-header { margin-bottom: 20px; }
        .analytics-loading { text-align: center; padding: 32px; }

        /* Grille de metriques */
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .metric-card { text-align: center; padding: 16px 12px; }
        .metric-value { font-size: 28px; font-weight: 700; line-height: 1.2; }
        .metric-value.accent { color: var(--accent); }
        .metric-value.success { color: var(--success); }
        .metric-value.warning { color: var(--warning); }
        .metric-value.info { color: #3b82f6; }
        .metric-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

        /* Grille de graphiques */
        .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .chart-container { }
        .chart-title { margin-bottom: 12px; }

        /* Composant BarChart */
        .bar-chart { display: grid; gap: 4px; }
        .bar-row { display: flex; align-items: center; gap: 8px; }
        .bar-label { width: 80px; font-size: 11px; color: var(--text-secondary); text-align: right; flex-shrink: 0; }
        .bar-fill { height: 18px; border-radius: 3px; opacity: 0.8; transition: width 0.3s; }
        .bar-value { font-size: 12px; color: var(--text-primary); font-weight: 600; }

        /* Message vide */
        .empty-message { color: var(--text-secondary); font-size: 13px; margin: 0; }

        /* Health checks */
        .hc-list { display: grid; gap: 6px; }
        .hc-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; }
        .hc-name { font-size: 13px; color: var(--text-primary); }
        .hc-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
        .hc-ok { background: rgba(16, 185, 129, 0.15); color: var(--success); }
        .hc-fail { background: rgba(239, 68, 68, 0.15); color: var(--error); }

        /* Tableau historique */
        .history-section { margin-top: 16px; }
        .history-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .history-thead-row { border-bottom: 1px solid var(--border); }
        .history-th { text-align: left; padding: 6px 8px; color: var(--text-secondary); font-weight: 600; }
        .history-row { border-bottom: 1px solid var(--border); }
        .history-row:hover { background: rgba(255, 255, 255, 0.02); }
        .history-td { padding: 6px 8px; }
        .history-td-dir { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
        .history-td-date { font-size: 11px; color: var(--text-secondary); }

        /* Responsive: empiler les graphiques sur petit ecran */
        @media (max-width: 768px) {
          .charts-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

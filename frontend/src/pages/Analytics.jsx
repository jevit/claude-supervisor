import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

/**
 * Barre horizontale proportionnelle (CSS, pas ASCII).
 */
function BarChart({ data, maxWidth = 200, color = 'var(--accent)' }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-row">
          <span className="bar-label">{d.label}</span>
          <div
            className="bar-fill"
            style={{ width: Math.max(2, (d.value / max) * maxWidth), background: color }}
          />
          <span className="bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Carte KPI principale.
 */
function KpiCard({ value, label, color = 'accent', sub }) {
  return (
    <div className="card metric-card">
      <div className={`metric-value ${color}`}>{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

/**
 * Formater une durée en minutes : « 2h 14m » ou « 47m » ou « < 1m ».
 */
function fmtDuration(minutes) {
  if (!minutes || minutes < 1) return '< 1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Analytics() {
  const [sessions,     setSessions]     = useState([]);
  const [timeline,     setTimeline]     = useState([]);
  const [healthChecks, setHealthChecks] = useState([]);
  const [squads,       setSquads]       = useState([]);
  const [terminals,    setTerminals]    = useState([]);
  const [loading,      setLoading]      = useState(true);

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch('/api/sessions').then((r) => r.json()),
      fetch('/api/timeline?limit=500').then((r) => r.json()),
      fetch('/api/health-checks').then((r) => r.json()),
      fetch('/api/squads').then((r) => r.json()),
      fetch('/api/terminals').then((r) => r.json()),
    ]).then(([sess, tl, hc, sq, terms]) => {
      setSessions(Array.isArray(sess)  ? sess  : []);
      setTimeline(Array.isArray(tl)   ? tl    : []);
      setHealthChecks(Array.isArray(hc) ? hc  : []);
      setSquads(Array.isArray(sq)     ? sq    : []);
      setTerminals(Array.isArray(terms) ? terms : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Rafraîchir sur events WS pertinents
  useWebSocket(useCallback((event) => {
    if (
      event.startsWith('session:') ||
      event.startsWith('squad:')   ||
      event.startsWith('terminal:')
    ) fetchAll();
  }, [fetchAll]));

  if (loading) return <div className="card analytics-loading">Chargement...</div>;

  /* ─── Sessions ─────────────────────────────────────────────────── */
  const statusCounts = {};
  for (const s of sessions) statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;

  /* ─── Terminaux ─────────────────────────────────────────────────── */
  const termExited   = terminals.filter((t) => t.status === 'exited');
  const termDurations = termExited
    .filter((t) => t.exitedAt && t.createdAt)
    .map((t) => (new Date(t.exitedAt) - new Date(t.createdAt)) / 60000);
  const avgTermDuration = termDurations.length > 0
    ? termDurations.reduce((a, b) => a + b, 0) / termDurations.length
    : 0;

  /* ─── Squads ─────────────────────────────────────────────────────── */
  const squadByStatus = {};
  for (const s of squads) squadByStatus[s.status] = (squadByStatus[s.status] || 0) + 1;

  const completedSquads  = squads.filter((s) => s.status === 'completed').length;
  const finishedSquads   = squads.filter((s) => ['completed', 'cancelled', 'partial'].includes(s.status)).length;
  const squadCompletionRate = finishedSquads > 0
    ? Math.round((completedSquads / finishedSquads) * 100)
    : null;

  const squadDurations = squads
    .filter((s) => s.completedAt && s.createdAt)
    .map((s) => (new Date(s.completedAt) - new Date(s.createdAt)) / 60000);
  const avgSquadDuration = squadDurations.length > 0
    ? squadDurations.reduce((a, b) => a + b, 0) / squadDurations.length
    : 0;

  const avgAgentsPerSquad = squads.length > 0
    ? (squads.reduce((s, sq) => s + (sq.members?.length || 0), 0) / squads.length).toFixed(1)
    : 0;

  /* ─── Health checks ──────────────────────────────────────────────── */
  const hcTotal   = healthChecks.length;
  const hcOk      = healthChecks.filter((hc) => hc.lastResult?.success).length;
  const hcRate    = hcTotal > 0 ? Math.round((hcOk / hcTotal) * 100) : null;

  /* ─── Timeline ───────────────────────────────────────────────────── */
  const now = Date.now();
  const hourActivity = new Array(24).fill(0);
  for (const ev of timeline) {
    const age = now - new Date(ev.timestamp).getTime();
    if (age < 86400000) hourActivity[new Date(ev.timestamp).getHours()]++;
  }

  const typeCounts = {};
  for (const ev of timeline) {
    const type = (ev.event || ev.type || '').split(':')[0];
    if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  /* ─── Graphiques ─────────────────────────────────────────────────── */
  const sessionActivity = sessions
    .map((s) => ({ label: s.name || s.id?.substring(0, 8), value: s.history?.length || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const hcResults = healthChecks.map((hc) => ({
    label: hc.name,
    status: hc.lastResult?.success ? 'OK' : (hc.lastResult ? 'FAIL' : '—'),
  }));

  // Durée des squads (pour graph)
  const squadDurationData = squads
    .filter((s) => s.completedAt && s.createdAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 8)
    .map((s) => ({
      label: s.name.length > 12 ? s.name.substring(0, 12) + '…' : s.name,
      value: Math.round((new Date(s.completedAt) - new Date(s.createdAt)) / 60000),
    }));

  // Durée des terminaux (top 8 par durée)
  const terminalDurationData = termExited
    .filter((t) => t.exitedAt && t.createdAt)
    .sort((a, b) => (new Date(b.exitedAt) - new Date(b.createdAt)) - (new Date(a.exitedAt) - new Date(a.createdAt)))
    .slice(0, 8)
    .map((t) => ({
      label: (t.name || t.id?.substring(0, 8) || '?').substring(0, 14),
      value: Math.round((new Date(t.exitedAt) - new Date(t.createdAt)) / 60000),
    }));

  return (
    <div className="analytics-page">
      <h2 className="analytics-header">Analytics & KPIs</h2>

      {/* ── Métriques sessions/terminaux ──────────────────────────── */}
      <div className="kpi-section-title">Sessions & Terminaux</div>
      <div className="metrics-grid" style={{ marginBottom: 8 }}>
        <KpiCard value={sessions.length}                   label="Sessions totales"        color="accent" />
        <KpiCard value={statusCounts.active || 0}          label="Actives"                 color="success" />
        <KpiCard value={terminals.length}                  label="Terminaux lancés"        color="info" />
        <KpiCard
          value={fmtDuration(avgTermDuration)}
          label="Durée moy. terminal"
          color="warning"
          sub={termDurations.length > 0 ? `sur ${termDurations.length} terminé(s)` : 'aucun terminé'}
        />
      </div>

      {/* ── Métriques squads ──────────────────────────────────────── */}
      <div className="kpi-section-title" style={{ marginTop: 20 }}>Squads</div>
      <div className="metrics-grid" style={{ marginBottom: 8 }}>
        <KpiCard value={squads.length}                     label="Squads totaux"           color="accent" />
        <KpiCard
          value={squadCompletionRate !== null ? `${squadCompletionRate}%` : '—'}
          label="Taux de complétion"
          color={squadCompletionRate >= 80 ? 'success' : squadCompletionRate >= 50 ? 'warning' : 'error'}
          sub={`${completedSquads}/${finishedSquads} terminé(s)`}
        />
        <KpiCard
          value={fmtDuration(avgSquadDuration)}
          label="Durée moy. squad"
          color="info"
          sub={squadDurations.length > 0 ? `sur ${squadDurations.length} complété(s)` : 'aucun complété'}
        />
        <KpiCard value={avgAgentsPerSquad}                 label="Agents / squad (moy.)"   color="warning" />
      </div>

      {/* ── Métriques health checks ──────────────────────────────── */}
      {hcTotal > 0 && (
        <>
          <div className="kpi-section-title" style={{ marginTop: 20 }}>Health Checks</div>
          <div className="metrics-grid" style={{ marginBottom: 8 }}>
            <KpiCard value={hcTotal}                                label="Checks configurés"    color="accent" />
            <KpiCard value={hcOk}                                   label="OK"                   color="success" />
            <KpiCard value={hcTotal - hcOk}                         label="En échec"             color="error" />
            <KpiCard
              value={hcRate !== null ? `${hcRate}%` : '—'}
              label="Taux de succès"
              color={hcRate >= 80 ? 'success' : 'warning'}
            />
          </div>
        </>
      )}

      {/* ── Graphiques ────────────────────────────────────────────── */}
      <div className="charts-grid" style={{ marginTop: 24 }}>
        {/* Activité par heure */}
        <div className="card chart-container">
          <h3 className="chart-title">Activité par heure (24h)</h3>
          <BarChart
            data={hourActivity.map((v, h) => ({ label: `${String(h).padStart(2, '0')}h`, value: v }))}
            color="var(--accent)"
          />
        </div>

        {/* Événements par type */}
        <div className="card chart-container">
          <h3 className="chart-title">Événements par type</h3>
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

        {/* Durée des terminaux */}
        <div className="card chart-container">
          <h3 className="chart-title">Durée des terminaux (min)</h3>
          {terminalDurationData.length === 0 ? (
            <p className="empty-message">Aucun terminal terminé</p>
          ) : (
            <BarChart data={terminalDurationData} color="#f59e0b" />
          )}
        </div>

        {/* Statut des squads */}
        {squads.length > 0 && (
          <div className="card chart-container">
            <h3 className="chart-title">Squads par statut</h3>
            <BarChart
              data={Object.entries(squadByStatus)
                .sort((a, b) => b[1] - a[1])
                .map(([label, value]) => ({ label, value }))}
              color="var(--accent)"
            />
          </div>
        )}

        {/* Durée des squads */}
        {squadDurationData.length > 0 && (
          <div className="card chart-container">
            <h3 className="chart-title">Durée des squads complétés (min)</h3>
            <BarChart data={squadDurationData} color="#10b981" />
          </div>
        )}

        {/* Health checks */}
        {hcResults.length > 0 && (
          <div className="card chart-container">
            <h3 className="chart-title">Health Checks</h3>
            <div className="hc-list">
              {hcResults.map((hc, i) => (
                <div key={i} className="hc-row">
                  <span className="hc-name">{hc.label}</span>
                  <span className={`hc-badge hc-${hc.status.toLowerCase()}`}>{hc.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tableau terminaux ─────────────────────────────────────── */}
      {terminals.length > 0 && (
        <div className="card history-section">
          <h3 className="chart-title">Historique des terminaux</h3>
          <table className="history-table">
            <thead>
              <tr className="history-thead-row">
                <th className="history-th">Nom</th>
                <th className="history-th">Statut</th>
                <th className="history-th">Modèle</th>
                <th className="history-th">Durée</th>
                <th className="history-th">Lancé le</th>
              </tr>
            </thead>
            <tbody>
              {[...terminals]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((t) => {
                  const durMin = t.exitedAt && t.createdAt
                    ? (new Date(t.exitedAt) - new Date(t.createdAt)) / 60000
                    : t.createdAt ? (now - new Date(t.createdAt)) / 60000 : null;
                  return (
                    <tr key={t.id} className="history-row">
                      <td className="history-td">{t.name || t.id?.substring(0, 8)}</td>
                      <td className="history-td">
                        <span className={`status-badge status-${t.status}`}>{t.status}</span>
                      </td>
                      <td className="history-td history-td-mono">{t.model || '—'}</td>
                      <td className="history-td history-td-num">
                        {durMin !== null ? fmtDuration(durMin) : '—'}
                        {!t.exitedAt && t.status === 'running' && (
                          <span className="kpi-live-dot" title="En cours" />
                        )}
                      </td>
                      <td className="history-td history-td-date">
                        {t.createdAt ? new Date(t.createdAt).toLocaleString('fr-FR') : '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tableau squads ────────────────────────────────────────── */}
      {squads.length > 0 && (
        <div className="card history-section">
          <h3 className="chart-title">Historique des squads</h3>
          <table className="history-table">
            <thead>
              <tr className="history-thead-row">
                <th className="history-th">Nom</th>
                <th className="history-th">Statut</th>
                <th className="history-th">Agents</th>
                <th className="history-th">Complétion</th>
                <th className="history-th">Durée</th>
                <th className="history-th">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {[...squads]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map((sq) => {
                  const done = (sq.members || []).filter((m) => m.status === 'completed' || m.status === 'exited').length;
                  const total = (sq.members || []).length;
                  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
                  const durMin = sq.completedAt && sq.createdAt
                    ? (new Date(sq.completedAt) - new Date(sq.createdAt)) / 60000
                    : sq.createdAt && sq.status === 'running'
                      ? (now - new Date(sq.createdAt)) / 60000
                      : null;
                  return (
                    <tr key={sq.id} className="history-row">
                      <td className="history-td" style={{ fontWeight: 600 }}>{sq.name}</td>
                      <td className="history-td">
                        <span className={`status-badge status-${sq.status}`}>{sq.status}</span>
                      </td>
                      <td className="history-td history-td-num">{total}</td>
                      <td className="history-td">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="sq-rate-bar">
                            <div className="sq-rate-fill" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="history-td-num">{rate}%</span>
                        </div>
                      </td>
                      <td className="history-td history-td-num">
                        {durMin !== null ? fmtDuration(durMin) : '—'}
                        {sq.status === 'running' && <span className="kpi-live-dot" title="En cours" />}
                      </td>
                      <td className="history-td history-td-date">
                        {sq.createdAt ? new Date(sq.createdAt).toLocaleString('fr-FR') : '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .analytics-page { }
        .analytics-header { margin-bottom: 20px; }
        .analytics-loading { text-align: center; padding: 32px; }

        /* Titres de section KPI */
        .kpi-section-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }

        /* Grille de métriques */
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
        .metric-card { text-align: center; padding: 16px 12px; }
        .metric-value { font-size: 26px; font-weight: 700; line-height: 1.2; }
        .metric-value.accent  { color: var(--accent); }
        .metric-value.success { color: var(--success, #10b981); }
        .metric-value.warning { color: var(--warning, #f59e0b); }
        .metric-value.error   { color: var(--error,   #ef4444); }
        .metric-value.info    { color: #3b82f6; }
        .metric-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
        .metric-sub   { font-size: 10px; color: var(--text-secondary); margin-top: 2px; opacity: 0.7; }

        /* Grille graphiques */
        .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .chart-container { }
        .chart-title { margin-bottom: 12px; font-size: 14px; }

        /* BarChart */
        .bar-chart { display: grid; gap: 4px; }
        .bar-row   { display: flex; align-items: center; gap: 8px; }
        .bar-label { width: 80px; font-size: 11px; color: var(--text-secondary); text-align: right; flex-shrink: 0; }
        .bar-fill  { height: 18px; border-radius: 3px; opacity: 0.8; transition: width 0.3s; }
        .bar-value { font-size: 12px; color: var(--text-primary); font-weight: 600; }

        /* Vide */
        .empty-message { color: var(--text-secondary); font-size: 13px; margin: 0; }

        /* Health checks */
        .hc-list { display: grid; gap: 6px; }
        .hc-row  { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); }
        .hc-row:last-child { border-bottom: none; }
        .hc-name  { font-size: 13px; color: var(--text-primary); }
        .hc-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
        .hc-ok    { background: rgba(16,185,129,0.15); color: var(--success, #10b981); }
        .hc-fail  { background: rgba(239,68,68,0.15);  color: var(--error,   #ef4444); }
        .hc-—     { background: var(--bg-secondary); color: var(--text-secondary); }

        /* Tableaux */
        .history-section { margin-top: 16px; }
        .history-table   { width: 100%; border-collapse: collapse; font-size: 13px; }
        .history-thead-row { border-bottom: 1px solid var(--border); }
        .history-th      { text-align: left; padding: 6px 8px; color: var(--text-secondary); font-weight: 600; font-size: 12px; }
        .history-row     { border-bottom: 1px solid var(--border); }
        .history-row:hover { background: rgba(255,255,255,0.02); }
        .history-td      { padding: 6px 8px; }
        .history-td-date { font-size: 11px; color: var(--text-secondary); }
        .history-td-num  { font-size: 12px; font-weight: 600; font-family: monospace; }
        .history-td-mono { font-family: 'Cascadia Code', Consolas, monospace; font-size: 11px; color: var(--text-secondary); }

        /* Barre complétion squads */
        .sq-rate-bar  { width: 60px; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .sq-rate-fill { height: 100%; background: var(--accent); border-radius: 3px; }

        /* Pastille "live" */
        .kpi-live-dot { display: inline-block; width: 6px; height: 6px; background: var(--success, #10b981); border-radius: 50%; margin-left: 5px; animation: pulse-dot 1.5s ease-in-out infinite; vertical-align: middle; }
        @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        @media (max-width: 768px) {
          .charts-grid { grid-template-columns: 1fr; }
          .metrics-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}

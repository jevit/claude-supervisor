import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWebSocket } from '../services/websocket';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts';

/* ── Palette Tokyonight ──────────────────────────────────────────── */
const C = {
  accent:  '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  error:   '#ef4444',
  info:    '#3b82f6',
  muted:   '#64748b',
  border:  '#2a2b3d',
  text:    '#a9b1d6',
  bg:      '#1a1b26',
};

const SQUAD_STATUS_COLORS = {
  running:   C.accent,
  completed: C.success,
  cancelled: C.error,
  partial:   C.warning,
};

/* ── Tooltip personnalisé ────────────────────────────────────────── */
function CustomTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1f2335', border: `1px solid ${C.border}`, borderRadius: 6,
      padding: '6px 10px', fontSize: 12, color: C.text,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.accent }}>
          {p.name ? `${p.name} : ` : ''}{p.value}{unit}
        </div>
      ))}
    </div>
  );
}

/* ── Carte KPI ───────────────────────────────────────────────────── */
function KpiCard({ value, label, color = C.accent, sub }) {
  return (
    <div className="card metric-card">
      <div className="metric-value" style={{ color }}>{value}</div>
      <div className="metric-label">{label}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

/* ── Utilitaire durée ────────────────────────────────────────────── */
export function fmtDuration(minutes) {
  if (!minutes || minutes < 1) return '< 1m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ── Wrapper chart (titre + conteneur) ──────────────────────────── */
function ChartCard({ title, children, empty }) {
  return (
    <div className="card chart-container">
      <h3 className="chart-title">{title}</h3>
      {empty
        ? <p className="empty-message">{empty}</p>
        : children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Page principale
   ════════════════════════════════════════════════════════════════════ */
// Périodes disponibles pour le filtre (#64)
const PERIODS = [
  { label: '24h',  ms: 86400000 },
  { label: '7j',   ms: 7 * 86400000 },
  { label: '30j',  ms: 30 * 86400000 },
  { label: 'Tout', ms: Infinity },
];

export default function Analytics() {
  const [sessions,     setSessions]     = useState([]);
  const [timeline,     setTimeline]     = useState([]);
  const [healthChecks, setHealthChecks] = useState([]);
  const [squads,       setSquads]       = useState([]);
  const [terminals,    setTerminals]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [period,       setPeriod]       = useState(PERIODS[3]); // Tout par défaut (#64)

  const debounceRef = useRef(null);

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

  // Nettoyage du timer debounce au démontage
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Debounce 2s pour éviter les 5 requêtes en rafale (#28)
  useWebSocket(useCallback((event) => {
    if (event.startsWith('session:') || event.startsWith('squad:') || event.startsWith('terminal:')) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchAll, 2000);
    }
  }, [fetchAll]));

  if (loading) return <div className="card analytics-loading">Chargement...</div>;

  /* ── Données dérivées — recalculées uniquement si les données ou la période changent ── */
  const {
    now,
    filteredSessions, filteredTerminals, filteredSquads,
    statusCounts, termExited, termDurations, avgTermDuration,
    completedSquads, finishedSquads, squadCompletionRate, squadDurations, avgSquadDuration, avgAgentsPerSquad,
    hcTotal, hcOk, hcRate,
    hourActivityData, typeData, sessionActivityData, termDurationData, squadStatusData, squadDurationData,
  } = useMemo(() => {
    const now    = Date.now();
    const cutoff = period.ms === Infinity ? 0 : now - period.ms;
    const filteredSessions  = sessions.filter((s)  => !s.createdAt || new Date(s.createdAt).getTime() >= cutoff);
    const filteredTimeline  = timeline.filter((ev) => !ev.timestamp || new Date(ev.timestamp).getTime() >= cutoff);
    const filteredSquads    = squads.filter((s)   => !s.createdAt || new Date(s.createdAt).getTime() >= cutoff);
    const filteredTerminals = terminals.filter((t) => !t.createdAt || new Date(t.createdAt).getTime() >= cutoff);

    /* Sessions */
    const statusCounts = {};
    for (const s of filteredSessions) statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;

    /* Terminaux */
    const termExited    = filteredTerminals.filter((t) => t.status === 'exited');
    const termDurations = termExited
      .filter((t) => t.exitedAt && t.createdAt)
      .map((t) => (new Date(t.exitedAt) - new Date(t.createdAt)) / 60000);
    const avgTermDuration = termDurations.length > 0
      ? termDurations.reduce((a, b) => a + b, 0) / termDurations.length : 0;

    /* Squads */
    const completedSquads     = filteredSquads.filter((s) => s.status === 'completed').length;
    const finishedSquads      = filteredSquads.filter((s) => ['completed', 'cancelled', 'partial'].includes(s.status)).length;
    const squadCompletionRate = finishedSquads > 0 ? Math.round((completedSquads / finishedSquads) * 100) : null;
    const squadDurations      = filteredSquads
      .filter((s) => s.completedAt && s.createdAt)
      .map((s) => (new Date(s.completedAt) - new Date(s.createdAt)) / 60000);
    const avgSquadDuration = squadDurations.length > 0
      ? squadDurations.reduce((a, b) => a + b, 0) / squadDurations.length : 0;
    const avgAgentsPerSquad = filteredSquads.length > 0
      ? (filteredSquads.reduce((s, sq) => s + (sq.members?.length || 0), 0) / filteredSquads.length).toFixed(1) : 0;

    /* Health checks */
    const hcTotal = healthChecks.length;
    const hcOk    = healthChecks.filter((hc) => hc.lastResult?.success).length;
    const hcRate  = hcTotal > 0 ? Math.round((hcOk / hcTotal) * 100) : null;

    /* Graphiques */
    const hourActivityData = Array.from({ length: 24 }, (_, h) => {
      const count = filteredTimeline.filter((ev) => {
        const age = now - new Date(ev.timestamp).getTime();
        return age < 86400000 && new Date(ev.timestamp).getHours() === h;
      }).length;
      return { heure: `${String(h).padStart(2, '0')}h`, count };
    });

    const typeCounts = {};
    for (const ev of filteredTimeline) {
      const type = (ev.event || ev.type || '').split(':')[0];
      if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    const typeData = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    const sessionActivityData = filteredSessions
      .map((s) => ({ name: (s.name || s.id?.substring(0, 8) || '?').substring(0, 16), actions: s.history?.length || 0 }))
      .sort((a, b) => b.actions - a.actions).slice(0, 8);

    const termDurationData = termExited
      .filter((t) => t.exitedAt && t.createdAt)
      .map((t) => ({
        name: (t.name || t.id?.substring(0, 8) || '?').substring(0, 16),
        minutes: Math.round((new Date(t.exitedAt) - new Date(t.createdAt)) / 60000),
      }))
      .sort((a, b) => b.minutes - a.minutes).slice(0, 8);

    const squadStatusData = Object.entries(
      filteredSquads.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {})
    ).map(([status, value]) => ({ name: status, value }));

    const squadDurationData = filteredSquads
      .filter((s) => s.completedAt && s.createdAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 8)
      .map((s) => ({
        name: s.name.length > 14 ? s.name.substring(0, 14) + '…' : s.name,
        minutes: Math.round((new Date(s.completedAt) - new Date(s.createdAt)) / 60000),
      }));

    return {
      now,
      filteredSessions, filteredTerminals, filteredSquads,
      statusCounts, termExited, termDurations, avgTermDuration,
      completedSquads, finishedSquads, squadCompletionRate, squadDurations, avgSquadDuration, avgAgentsPerSquad,
      hcTotal, hcOk, hcRate,
      hourActivityData, typeData, sessionActivityData, termDurationData, squadStatusData, squadDurationData,
    };
  }, [sessions, timeline, squads, terminals, healthChecks, period]);

  /* ── Props graphiques (statiques) ──────────────────────────────── */
  const yAxisProps   = { tick: { fill: C.text, fontSize: 11 }, width: 120 };
  const xAxisProps   = { tick: { fill: C.text, fontSize: 11 } };
  const gridProps    = { stroke: C.border, strokeDasharray: '3 3', vertical: false };
  const tooltipStyle = { cursor: { fill: 'rgba(139,92,246,0.08)' } };

  // Export CSV des terminaux (#66)
  const exportCSV = () => {
    const rows = [['Nom', 'Statut', 'Modèle', 'Durée (min)', 'Lancé le']];
    [...terminals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach((t) => {
      const durMin = t.exitedAt && t.createdAt
        ? Math.round((new Date(t.exitedAt) - new Date(t.createdAt)) / 60000)
        : t.createdAt ? Math.round((now - new Date(t.createdAt)) / 60000) : '';
      rows.push([t.name || t.id?.substring(0, 8), t.status, t.model || '', durMin, t.createdAt ? new Date(t.createdAt).toLocaleString('fr-FR') : '']);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="analytics-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Analytics & KPIs</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sélecteur de période (#64) */}
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => setPeriod(p)}
                style={{
                  background: period.label === p.label ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.08)',
                  border: `1px solid ${period.label === p.label ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.2)'}`,
                  borderRadius: 5, color: period.label === p.label ? '#c4b5fd' : '#8b5cf6',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: '4px 9px',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {terminals.length > 0 && (
            <button onClick={exportCSV} style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, color: '#8b5cf6', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 12px' }}>
              📥 Exporter CSV
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs sessions/terminaux ──────────────────────────────── */}
      <div className="kpi-section-title">Sessions & Terminaux</div>
      <div className="metrics-grid">
        <KpiCard value={sessions.length}               label="Sessions totales"    color={C.accent} />
        <KpiCard value={statusCounts.active || 0}      label="Actives"             color={C.success} />
        <KpiCard value={terminals.length}              label="Terminaux lancés"    color={C.info} />
        <KpiCard
          value={fmtDuration(avgTermDuration)}
          label="Durée moy. terminal"
          color={C.warning}
          sub={termDurations.length > 0 ? `sur ${termDurations.length} terminé(s)` : 'aucun terminé'}
        />
      </div>

      {/* ── KPIs squads ─────────────────────────────────────────── */}
      <div className="kpi-section-title" style={{ marginTop: 20 }}>Squads</div>
      <div className="metrics-grid">
        <KpiCard value={squads.length}                 label="Squads totaux"       color={C.accent} />
        <KpiCard
          value={squadCompletionRate !== null ? `${squadCompletionRate}%` : '—'}
          label="Taux de complétion"
          color={squadCompletionRate === null ? C.muted : squadCompletionRate >= 80 ? C.success : squadCompletionRate >= 50 ? C.warning : C.error}
          sub={`${completedSquads}/${finishedSquads} terminé(s)`}
        />
        <KpiCard
          value={fmtDuration(avgSquadDuration)}
          label="Durée moy. squad"
          color={C.info}
          sub={squadDurations.length > 0 ? `sur ${squadDurations.length} complété(s)` : 'aucun complété'}
        />
        <KpiCard value={avgAgentsPerSquad}             label="Agents / squad"      color={C.warning} />
      </div>

      {/* ── KPIs health checks ───────────────────────────────────── */}
      {hcTotal > 0 && (
        <>
          <div className="kpi-section-title" style={{ marginTop: 20 }}>Health Checks</div>
          <div className="metrics-grid">
            <KpiCard value={hcTotal}                   label="Checks configurés"   color={C.accent} />
            <KpiCard value={hcOk}                      label="OK"                  color={C.success} />
            <KpiCard value={hcTotal - hcOk}            label="En échec"            color={C.error} />
            <KpiCard
              value={hcRate !== null ? `${hcRate}%` : '—'}
              label="Taux de succès"
              color={hcRate >= 80 ? C.success : C.warning}
            />
          </div>
        </>
      )}

      {/* ── Graphiques ────────────────────────────────────────────── */}
      <div className="charts-grid" style={{ marginTop: 28 }}>

        {/* Activité par heure */}
        <ChartCard title={`Activité par heure — 24h (${tz})`}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourActivityData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="heure" {...xAxisProps} interval={3} />
              <YAxis {...{ tick: { fill: C.text, fontSize: 11 } }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} {...tooltipStyle} />
              <Bar dataKey="count" name="événements" fill={C.accent} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Événements par type */}
        <ChartCard
          title="Événements par type"
          empty={typeData.length === 0 ? 'Aucun événement' : null}
        >
          <ResponsiveContainer width="100%" height={Math.max(160, typeData.length * 28)}>
            <BarChart data={typeData} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...xAxisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="type" {...yAxisProps} />
              <Tooltip content={<CustomTooltip />} {...tooltipStyle} />
              <Bar dataKey="count" name="count" fill={C.info} radius={[0, 2, 2, 0]}>
                {typeData.map((_, i) => (
                  <Cell key={i} fill={[C.accent, C.info, C.success, C.warning, C.error, C.muted][i % 6]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Sessions les plus actives */}
        <ChartCard
          title="Sessions les plus actives"
          empty={sessionActivityData.length === 0 ? 'Aucune session' : null}
        >
          <ResponsiveContainer width="100%" height={Math.max(120, sessionActivityData.length * 28)}>
            <BarChart data={sessionActivityData} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...xAxisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...yAxisProps} />
              <Tooltip content={<CustomTooltip />} {...tooltipStyle} />
              <Bar dataKey="actions" name="actions" fill={C.success} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Durée des terminaux */}
        <ChartCard
          title="Durée des terminaux (min)"
          empty={termDurationData.length === 0 ? 'Aucun terminal terminé' : null}
        >
          <ResponsiveContainer width="100%" height={Math.max(120, termDurationData.length * 28)}>
            <BarChart data={termDurationData} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...xAxisProps} allowDecimals={false} unit="m" />
              <YAxis type="category" dataKey="name" {...yAxisProps} />
              <Tooltip content={<CustomTooltip unit="m" />} {...tooltipStyle} />
              <Bar dataKey="minutes" name="durée" fill={C.warning} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Squads par statut — Donut */}
        {squadStatusData.length > 0 && (
          <ChartCard title="Squads par statut">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={squadStatusData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                  labelLine={false}
                >
                  {squadStatusData.map((entry, i) => (
                    <Cell key={i} fill={SQUAD_STATUS_COLORS[entry.name] || C.muted} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle" iconSize={8}
                  formatter={(val) => <span style={{ color: C.text, fontSize: 12 }}>{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Durée des squads complétés */}
        {squadDurationData.length > 0 && (
          <ChartCard title="Durée des squads complétés (min)">
            <ResponsiveContainer width="100%" height={Math.max(120, squadDurationData.length * 28)}>
              <BarChart data={squadDurationData} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} horizontal={false} vertical />
                <XAxis type="number" {...xAxisProps} allowDecimals={false} unit="m" />
                <YAxis type="category" dataKey="name" {...yAxisProps} />
                <Tooltip content={<CustomTooltip unit="m" />} {...tooltipStyle} />
                <Bar dataKey="minutes" name="durée" fill={C.success} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Health checks */}
        {healthChecks.length > 0 && (
          <ChartCard title="Health Checks">
            <div className="hc-list">
              {healthChecks.map((hc, i) => {
                const ok = hc.lastResult?.success;
                const status = hc.lastResult ? (ok ? 'OK' : 'FAIL') : '—';
                // Sparkline d'historique (#65) — 20 dernières exécutions
                const hist = hc.history || [];
                return (
                  <div key={i} className="hc-row">
                    <span className="hc-name">{hc.name}</span>
                    {/* Sparkline succès/échec */}
                    {hist.length > 0 && (
                      <svg width={hist.length * 5} height={14} style={{ flexShrink: 0 }}>
                        {hist.map((h, j) => (
                          <rect key={j} x={j * 5} y={h.success ? 2 : 6} width={4} height={h.success ? 12 : 8}
                            fill={h.success ? C.success : C.error} rx={1} opacity={0.8} />
                        ))}
                      </svg>
                    )}
                    <span className="hc-badge" style={{
                      background: ok ? 'rgba(16,185,129,0.15)' : hc.lastResult ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)',
                      color: ok ? C.success : hc.lastResult ? C.error : C.muted,
                    }}>
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
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
                        {!t.exitedAt && t.status === 'running' && <span className="kpi-live-dot" />}
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
                  const done  = (sq.members || []).filter((m) => m.status === 'completed' || m.status === 'exited').length;
                  const total = (sq.members || []).length;
                  const rate  = total > 0 ? Math.round((done / total) * 100) : 0;
                  const durMin = sq.completedAt && sq.createdAt
                    ? (new Date(sq.completedAt) - new Date(sq.createdAt)) / 60000
                    : sq.status === 'running' && sq.createdAt ? (now - new Date(sq.createdAt)) / 60000 : null;
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
                        {sq.status === 'running' && <span className="kpi-live-dot" />}
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

        .kpi-section-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
        .metric-card { text-align: center; padding: 16px 12px; }
        .metric-value { font-size: 26px; font-weight: 700; line-height: 1.2; }
        .metric-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
        .metric-sub   { font-size: 10px; color: var(--text-secondary); margin-top: 2px; opacity: 0.7; }

        .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .chart-container { }
        .chart-title { margin-bottom: 14px; font-size: 14px; }
        .empty-message { color: var(--text-secondary); font-size: 13px; margin: 0; }

        .hc-list { display: grid; gap: 6px; }
        .hc-row  { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border); }
        .hc-row:last-child { border-bottom: none; }
        .hc-name  { font-size: 13px; color: var(--text-primary); }
        .hc-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }

        .history-section { margin-top: 16px; }
        .history-table   { width: 100%; border-collapse: collapse; font-size: 13px; }
        .history-thead-row { border-bottom: 1px solid var(--border); }
        .history-th { text-align: left; padding: 6px 8px; color: var(--text-secondary); font-weight: 600; font-size: 12px; }
        .history-row { border-bottom: 1px solid var(--border); }
        .history-row:hover { background: rgba(255,255,255,0.02); }
        .history-td { padding: 6px 8px; }
        .history-td-date { font-size: 11px; color: var(--text-secondary); }
        .history-td-num  { font-size: 12px; font-weight: 600; font-family: monospace; }
        .history-td-mono { font-family: 'Cascadia Code', Consolas, monospace; font-size: 11px; color: var(--text-secondary); }

        .sq-rate-bar  { width: 60px; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .sq-rate-fill { height: 100%; background: var(--accent); border-radius: 3px; }

        .kpi-live-dot { display: inline-block; width: 6px; height: 6px; background: #10b981; border-radius: 50%; margin-left: 5px; animation: pulse-dot 1.5s ease-in-out infinite; vertical-align: middle; }
        @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        @media (max-width: 900px) {
          .charts-grid { grid-template-columns: 1fr; }
          .metrics-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}

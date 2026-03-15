import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';
import GitDiffPanel from '../components/GitDiffPanel';
import { useToast } from '../components/Toast';

const STATUS_COLOR = { modified: '#3b82f6', added: '#10b981', deleted: '#ef4444', untracked: '#6b7280' };
const STATUS_LETTER = { modified: 'M', added: 'A', deleted: 'D', untracked: '?' };

/* ── Vue globale des fichiers modifiés par session ────────────────── */
function FilesOverview() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState({}); // terminalId -> bool

  const fetch$ = useCallback(() => {
    fetch('/api/git/all-changes')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetch$(); const t = setInterval(fetch$, 8000); return () => clearInterval(t); }, [fetch$]);

  // Ecouter les file:activity pour refresh rapide
  useEffect(() => {
    const handler = (e) => { if (e.detail?.event === 'file:activity') fetch$(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetch$]);

  if (loading) return <div className="card" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chargement…</div>;
  if (!data) return null;

  const { terminals, hotFiles } = data;
  const totalFiles = terminals.reduce((s, t) => s + (t.files?.length || 0), 0);
  const conflictFiles = hotFiles.filter((f) => f.sessions.length > 1);

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Résumé global */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {terminals.length} terminal{terminals.length !== 1 ? 'aux' : ''} actif{terminals.length !== 1 ? 's' : ''}
        </span>
        {totalFiles > 0 && (
          <span style={{ fontSize: 13, padding: '1px 10px', borderRadius: 10, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontWeight: 600 }}>
            {totalFiles} fichier{totalFiles > 1 ? 's' : ''} modifié{totalFiles > 1 ? 's' : ''}
          </span>
        )}
        {conflictFiles.length > 0 && (
          <span style={{ fontSize: 13, padding: '1px 10px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 700 }}>
            ⚠ {conflictFiles.length} conflit{conflictFiles.length > 1 ? 's' : ''} potentiel{conflictFiles.length > 1 ? 's' : ''}
          </span>
        )}
        <button onClick={fetch$} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px 10px', fontSize: 12 }}>↻ Rafraîchir</button>
      </div>

      {/* Heatmap des conflits */}
      {conflictFiles.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            ⚡ Fichiers touchés par plusieurs sessions
          </div>
          {conflictFiles.map((f) => {
            const intensity = Math.min(f.sessions.length - 1, 2); // 0=orange, 1=rouge, 2=rouge vif
            const colors = ['#f59e0b', '#ef4444', '#dc2626'];
            const bgs = ['rgba(245,158,11,0.1)', 'rgba(239,68,68,0.1)', 'rgba(220,38,38,0.15)'];
            return (
              <div key={`${f.directory}/${f.path}`} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                background: bgs[intensity], borderRadius: 5, marginBottom: 4,
              }}>
                <span style={{ width: 18, height: 18, borderRadius: 3, background: colors[intensity] + '22', color: colors[intensity], fontSize: 11, fontWeight: 700, fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {STATUS_LETTER[f.status] || 'M'}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${f.directory}/${f.path}`}>
                  {f.path}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {f.sessions.map((s) => (
                    <span key={s.id} style={{ fontSize: 10, background: colors[intensity] + '22', color: colors[intensity], border: `1px solid ${colors[intensity]}44`, borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace', fontWeight: 600 }}>
                      {s.name || s.id.substring(0, 8)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Par terminal */}
      {terminals.length === 0 ? (
        <div className="card empty-state">Aucun terminal actif</div>
      ) : (
        terminals.map((t) => {
          const open = !collapsed[t.id];
          const fileCount = t.files?.length || 0;
          return (
            <div key={t.id} className="card" style={{ marginBottom: 8, padding: 0, overflow: 'hidden' }}>
              {/* En-tête terminal */}
              <div
                onClick={() => setCollapsed((p) => ({ ...p, [t.id]: !p[t.id] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>{t.name}</span>
                {t.currentBranch && (
                  <span style={{ fontSize: 10, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>
                    ⎇ {t.currentBranch}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.directory}>
                  {t.directory}
                </span>
                {fileCount > 0 ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.12)', padding: '1px 8px', borderRadius: 10 }}>
                    {fileCount} fichier{fileCount > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: '#10b981' }}>✓ propre</span>
                )}
                {t.error && <span style={{ fontSize: 11, color: '#6b7280' }}>non-git</span>}
                <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
              </div>

              {/* Liste des fichiers */}
              {open && fileCount > 0 && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {t.files.map((f) => {
                    const color = STATUS_COLOR[f.status] || '#6b7280';
                    // Ce fichier est-il aussi modifié par une autre session ?
                    const hotFile = hotFiles.find((h) => h.path === f.path && h.directory === t.directory && h.sessions.length > 1);
                    return (
                      <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '1px solid rgba(45,49,72,0.4)', background: hotFile ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                        <span style={{ width: 16, height: 16, borderRadius: 3, background: color + '22', color, fontSize: 10, fontWeight: 700, fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {STATUS_LETTER[f.status] || 'M'}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: hotFile ? '#fca5a5' : 'var(--text-primary)', flex: 1 }} title={f.path}>
                          {f.path}
                        </span>
                        {hotFile && (
                          <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }} title="Touché par plusieurs sessions">⚠</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {open && fileCount === 0 && !t.error && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: '#10b981', borderTop: '1px solid var(--border)' }}>Working tree propre</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Conflicts() {
  const addToast = useToast();
  const [conflicts, setConflicts] = useState([]);
  const [locks, setLocks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  // États de chargement par action : { [key]: bool }
  const [unlocking, setUnlocking] = useState({});
  const [notifying, setNotifying] = useState({});
  const [notified, setNotified]   = useState({});
  const [expandedDiff, setExpandedDiff] = useState({}); // { [conflictKey]: sessionId } (#33)

  const fetchData = useCallback(() => {
    Promise.all([
      fetch('/api/conflicts').then((r) => r.json()),
      fetch('/api/locks').then((r) => r.json()),
    ])
      .then(([c, l]) => { setConflicts(c); setLocks(l); setLoading(false); })
      .catch(console.error);
  }, []);

  // Chargement initial + polling fallback toutes les 5s (pause si onglet masqué)
  useEffect(() => {
    fetchData();
    let t = setInterval(fetchData, 5000);
    const onVisibility = () => {
      if (document.hidden) { clearInterval(t); t = null; }
      else { clearInterval(t); fetchData(); t = setInterval(fetchData, 5000); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisibility); };
  }, [fetchData]);

  // Mises à jour temps réel via WS
  useWebSocket(useCallback((event) => {
    if (event.startsWith('lock:') || event.startsWith('conflict:')) fetchData();
  }, [fetchData]));

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const c = await fetch('/api/conflicts/analyze', { method: 'POST' }).then((r) => r.json());
      setConflicts(c);
      addToast(c.length === 0 ? '✓ Aucun conflit détecté' : `⚠ ${c.length} conflit(s) détecté(s)`, c.length === 0 ? 'success' : 'warning');
    } catch {
      addToast('Erreur lors de l\'analyse', 'error');
    }
    setAnalyzing(false);
  };

  // Forcer le unlock d'un holder sur un fichier
  const handleForceUnlock = async (filePath, sessionId) => {
    const key = `${filePath}::${sessionId}`;
    setUnlocking((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch('/api/locks/force-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, sessionId, reason: 'admin-ui' }),
      });
      if (res.ok) {
        addToast(`✓ Verrou libéré — ${filePath.split('/').pop() || filePath}`, 'success');
      } else {
        addToast('Erreur lors du déverrouillage', 'error');
      }
      fetchData();
    } catch {
      addToast('Erreur lors du déverrouillage', 'error');
    }
    setUnlocking((p) => ({ ...p, [key]: false }));
  };

  // Notifier toutes les sessions impliquées dans un conflit
  const handleNotify = async (conflict) => {
    const key = conflict.id || conflict.details?.filePath || conflict.details?.directory;
    setNotifying((p) => ({ ...p, [key]: true }));
    const path = conflict.details?.filePath || conflict.details?.directory || '';
    try {
      const res = await fetch('/api/conflicts/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: conflict.sessions,
          message: `Conflit détecté sur "${path}". Coordonnez-vous avant de continuer.`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      addToast(`✓ ${data.sent ?? conflict.sessions.length} session(s) notifiée(s)`, 'success');
      setNotified((p) => ({ ...p, [key]: true }));
      setTimeout(() => setNotified((p) => ({ ...p, [key]: false })), 2500);
    } catch {
      addToast('Erreur lors de la notification', 'error');
    }
    setNotifying((p) => ({ ...p, [key]: false }));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Conflits & Locks</h1>
        <button className="btn-primary" onClick={handleAnalyze} disabled={analyzing}>
          {analyzing ? 'Analyse...' : 'Analyser maintenant'}
        </button>
      </div>

      {/* Vue globale fichiers cross-sessions */}
      <h2 style={{ marginBottom: 12 }}>Fichiers modifiés — vue globale</h2>
      <FilesOverview />

      {/* Conflits actifs */}
      <h2 style={{ marginBottom: 16 }}>
        Conflits actifs
        {conflicts.length > 0 && (
          <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: 'var(--error, #ef4444)' }}>
            {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''}
          </span>
        )}
      </h2>

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement...</span></div>
      ) : conflicts.length === 0 ? (
        <div className="card empty-state">Aucun conflit détecté</div>
      ) : (
        conflicts.map((c) => {
          const path   = c.details?.filePath || c.details?.directory || '';
          const key    = c.id || `${c.type}:${path}`;
          const isNotifying = notifying[key];
          const isDone      = notified[key];
          return (
            <div key={key} className={`card conflict-card severity-${c.severity}`}>
              <div className="conflict-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`status-badge status-${c.severity === 'error' ? 'error' : 'working'}`}>
                    {c.type === 'file' ? 'Fichier' : 'Répertoire'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.sessions.length} sessions</span>
                </div>
                <button
                  className="action-btn notify-btn"
                  onClick={() => handleNotify(c)}
                  disabled={isNotifying || isDone}
                >
                  {isDone ? '✓ Notifié' : isNotifying ? '...' : 'Notifier les sessions'}
                </button>
              </div>
              <p className="conflict-detail">{path}</p>
              <div className="conflict-sessions-list">
                {c.sessions.map((s) => (
                  <span key={s} className="session-tag">{s.substring(0, 8)}</span>
                ))}
              </div>
              <div className="conflict-suggestion">
                {c.type === 'file'
                  ? 'Suggestion : coordonner les modifications ou attendre que la première session termine.'
                  : 'Suggestion : vérifier que les sessions ne travaillent pas sur les mêmes fichiers.'}
              </div>
              {/* Diff détaillé par session (#33) */}
              {c.type === 'file' && c.sessions.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.sessions.map((sid) => {
                    const isExpanded = expandedDiff[key] === sid;
                    return (
                      <button key={sid}
                        onClick={() => setExpandedDiff((prev) => ({ ...prev, [key]: isExpanded ? null : sid }))}
                        style={{ fontSize: 11, background: isExpanded ? 'rgba(139,92,246,0.15)' : 'none', border: '1px solid var(--border)', borderRadius: 4, color: isExpanded ? '#8b5cf6' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px 8px' }}
                        title={`Voir le diff Git de la session ${sid.substring(0, 8)}`}
                      >
                        {isExpanded ? '▲' : '⎇'} Diff {sid.substring(0, 8)}
                      </button>
                    );
                  })}
                </div>
              )}
              {expandedDiff[key] && (
                <div style={{ marginTop: 8 }}>
                  <GitDiffPanel terminalId={expandedDiff[key]} />
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Locks actifs */}
      <h2 style={{ marginTop: 32, marginBottom: 16 }}>
        Fichiers verrouillés
        {locks.length > 0 && (
          <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>
            {locks.length}
          </span>
        )}
      </h2>

      {locks.length === 0 ? (
        <div className="card empty-state">Aucun fichier verrouillé</div>
      ) : (
        <div className="locks-table">
          <div className="locks-header">
            <span>Fichier</span>
            <span>Sessions</span>
            <span>Statut</span>
            <span>Actions</span>
          </div>
          {locks.map((l) => (
            <div key={l.filePath} className={`locks-row ${l.conflict ? 'conflict-row' : ''}`}>
              <span className="lock-path" title={l.filePath}>{l.filePath}</span>
              <span className="lock-holders">
                {l.holders.map((h) => (
                  <span key={h} className="session-tag">{h.substring(0, 8)}</span>
                ))}
              </span>
              <span>
                {l.conflict
                  ? <span className="conflict-badge-inline">⚠ Conflit</span>
                  : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
              </span>
              <span className="lock-actions">
                {l.holders.map((h) => {
                  const key = `${l.filePath}::${h}`;
                  return (
                    <button
                      key={h}
                      className="action-btn unlock-btn"
                      onClick={() => handleForceUnlock(l.filePath, h)}
                      disabled={unlocking[key]}
                      title={`Forcer unlock pour ${h.substring(0, 8)}`}
                    >
                      {unlocking[key] ? '...' : 'Unlock'}
                    </button>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .empty-state { color: var(--text-secondary); font-size: 14px; }
        .conflict-card { margin-bottom: 12px; }
        .severity-error { border-left: 3px solid var(--error, #ef4444); }
        .severity-warning { border-left: 3px solid var(--warning, #f59e0b); }
        .conflict-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .conflict-detail { font-size: 14px; font-family: monospace; color: var(--text-primary); margin-bottom: 8px; word-break: break-all; }
        .conflict-sessions-list { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .session-tag { background: var(--bg-primary); border: 1px solid var(--border); padding: 2px 8px; border-radius: 4px; font-size: 12px; font-family: monospace; color: var(--text-secondary); }
        .conflict-suggestion { font-size: 12px; color: var(--accent); padding: 6px 10px; background: rgba(139,92,246,0.06); border-radius: 6px; margin-top: 4px; }
        .action-btn { border: none; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; font-weight: 600; transition: opacity 0.15s; }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .notify-btn { background: rgba(139,92,246,0.15); color: var(--accent); }
        .notify-btn:hover:not(:disabled) { background: rgba(139,92,246,0.25); }
        .unlock-btn { background: rgba(239,68,68,0.12); color: var(--error, #ef4444); font-size: 11px; padding: 3px 8px; }
        .unlock-btn:hover:not(:disabled) { background: rgba(239,68,68,0.25); }
        .conflict-badge-inline { font-size: 11px; font-weight: 700; color: var(--error, #ef4444); background: rgba(239,68,68,0.12); padding: 2px 8px; border-radius: 4px; }
        .locks-table { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .locks-header, .locks-row { display: grid; grid-template-columns: 1fr 180px 100px 120px; padding: 10px 16px; align-items: center; gap: 8px; }
        .locks-header { background: var(--bg-secondary); font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
        .locks-row { border-top: 1px solid var(--border); font-size: 13px; }
        .conflict-row { background: rgba(239,68,68,0.04); }
        .lock-path { font-family: monospace; word-break: break-all; font-size: 12px; }
        .lock-holders { display: flex; gap: 4px; flex-wrap: wrap; }
        .lock-actions { display: flex; gap: 4px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}

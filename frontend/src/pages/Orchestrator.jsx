import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../services/websocket';
import { STATUS_COLOR, cleanAnsi, lastLines } from '../utils/agent-utils';

/* ── Carte KPI ───────────────────────────────────────────────────── */
function Kpi({ value, label, color = '#8b5cf6', onClick }) {
  return (
    <div className="orc-kpi" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="orc-kpi-val" style={{ color }}>{value}</div>
      <div className="orc-kpi-lbl">{label}</div>
    </div>
  );
}

/* ── Résumé git d'un répertoire ──────────────────────────────────── */
function GitSummary({ directory }) {
  const [git, setGit]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGit = useCallback(() => {
    if (!directory) { setLoading(false); return; }
    setRefreshing(true);
    fetch('/api/git/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory }),
    })
      .then((r) => r.json())
      .then((d) => { setGit(d); setLoading(false); setRefreshing(false); })
      .catch(() => { setLoading(false); setRefreshing(false); });
  }, [directory]);

  useEffect(() => {
    fetchGit();
    // Rafraîchissement toutes les 30s
    const t = setInterval(fetchGit, 30000);
    return () => clearInterval(t);
  }, [fetchGit]);

  if (loading) return <div className="orc-git-bar"><span className="orc-git-muted">git…</span></div>;
  if (!git || git.error) return null;

  const { modified = 0, added = 0, deleted = 0, untracked = 0 } = git.summary || {};
  const hasChanges = (git.files?.length || 0) > 0;
  const hasCommits = (git.recentCommits?.length || 0) > 0;

  return (
    <div className="orc-git-root">
      {/* ── Barre de résumé toujours visible ── */}
      <div className="orc-git-bar">
        <span className="orc-git-icon">⎇</span>
        {hasChanges ? (
          <span className="orc-git-badge">
            <span style={{ color: '#f59e0b' }}>{git.files.length} modif{git.files.length > 1 ? 's' : ''}</span>
            {modified > 0  && <span style={{ color: '#f59e0b' }}> ~{modified}</span>}
            {added > 0     && <span style={{ color: '#10b981' }}> +{added}</span>}
            {deleted > 0   && <span style={{ color: '#ef4444' }}> -{deleted}</span>}
            {untracked > 0 && <span style={{ color: '#64748b' }}> ?{untracked}</span>}
          </span>
        ) : (
          <span className="orc-git-clean">✓ tree propre</span>
        )}
        {hasCommits && (
          <span className="orc-git-muted" style={{ fontSize: 10 }}>
            · {git.recentCommits[0].message.slice(0, 40)}{git.recentCommits[0].message.length > 40 ? '…' : ''}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            className="orc-git-btn"
            onClick={() => fetchGit()}
            title="Rafraîchir"
            disabled={refreshing}
          >
            {refreshing ? '⟳' : '↺'}
          </button>
          <button
            className={`orc-git-btn ${open ? 'orc-git-btn-active' : ''}`}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '▲ Fermer' : '▼ Détails'}
          </button>
        </div>
      </div>

      {/* ── Panneau dépliable — max-height pour garantir la visibilité ── */}
      <div className="orc-git-panel" style={{ maxHeight: open ? 600 : 0 }}>
        <div className="orc-git-panel-inner">
          {/* Fichiers modifiés */}
          {hasChanges && (
            <div className="orc-git-section">
              <div className="orc-git-section-title">Fichiers modifiés</div>
              {git.files.map((f, i) => <FileHunk key={i} file={f} />)}
            </div>
          )}

          {/* Derniers commits */}
          {hasCommits && (
            <div className="orc-git-section">
              <div className="orc-git-section-title">Historique récent</div>
              {git.recentCommits.map((c) => (
                <div key={c.hash} className="orc-git-commit">
                  <code className="orc-git-hash">{c.hash}</code>
                  <span className="orc-git-msg">{c.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Fichier + hunk de diff ──────────────────────────────────────── */
function FileHunk({ file }) {
  const [open, setOpen] = useState(false);
  const statusColor = { modified: '#f59e0b', added: '#10b981', deleted: '#ef4444', untracked: '#64748b' };

  return (
    <div style={{ border: '1px solid #2a2b3d', borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: '#1a1b26', border: 'none', padding: '5px 10px',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ color: statusColor[file.status] || '#64748b', fontWeight: 700, fontSize: 11, width: 14 }}>
          {file.status[0].toUpperCase()}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#c0caf5', flex: 1 }}>{file.path}</span>
        <span style={{ fontSize: 10, color: '#565f89' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && file.diff && (
        <pre style={{
          margin: 0, padding: '6px 10px',
          background: '#141520', fontFamily: 'monospace', fontSize: 10,
          color: '#c0caf5', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          maxHeight: 300, overflowY: 'auto', lineHeight: 1.5,
        }}>
          {file.diff.split('\n').map((line, i) => (
            <span key={i} style={{
              display: 'block',
              color: line.startsWith('+') ? '#10b981'
                   : line.startsWith('-') ? '#ef4444'
                   : line.startsWith('@@') ? '#8b5cf6'
                   : '#c0caf5',
            }}>
              {line || ' '}
            </span>
          ))}
        </pre>
      )}
      {open && !file.diff && (
        <div style={{ padding: '6px 10px', fontSize: 11, color: '#565f89', background: '#141520' }}>
          Pas de diff disponible
        </div>
      )}
    </div>
  );
}

/* ── Panneau d'un membre de squad ────────────────────────────────── */
function MemberCard({ member, output }) {
  const lines = lastLines(output, 4);
  const color = STATUS_COLOR[member.status] || '#64748b';

  return (
    <div className="orc-member" style={{ borderLeftColor: color }}>
      <div className="orc-member-header">
        <span className="orc-member-name">{member.name}</span>
        <span className="orc-member-badge" style={{ background: color }}>{member.status}</span>
      </div>
      {member.task && <p className="orc-member-task">{member.task}</p>}
      {member.status === 'waiting' && member.dependsOn?.length > 0 && (
        <p className="orc-member-task orc-muted">⏱ Attend : {member.dependsOn.join(', ')}</p>
      )}
      {member.status !== 'waiting' && (
        <pre className="orc-member-output">{lines || '…'}</pre>
      )}
      {member.progress > 0 && (
        <div className="orc-member-bar">
          <div className="orc-member-fill" style={{ width: `${member.progress}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

/* ── Carte d'un squad ────────────────────────────────────────────── */
function SquadCard({ squad, outputs, onBroadcast, onNavigate }) {
  const [msg, setMsg]           = useState('');
  const [feedback, setFeedback] = useState('');

  const running   = squad.members.filter((m) => m.status === 'running').length;
  const done      = squad.members.filter((m) => ['completed', 'exited'].includes(m.status)).length;
  const total     = squad.members.length;
  const progress  = total > 0 ? Math.round(squad.members.reduce((s, m) => s + (m.progress || 0), 0) / total) : 0;

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!msg.trim()) return;
    const res  = await fetch(`/api/squads/${squad.id}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg.trim() }),
    });
    const data = await res.json();
    setFeedback(`✓ envoyé à ${data.sent} agent(s)`);
    setMsg('');
    setTimeout(() => setFeedback(''), 3000);
  };

  return (
    <div className="orc-squad">
      {/* En-tête squad */}
      <div className="orc-squad-header">
        <div className="orc-squad-title-row">
          <button className="orc-squad-name" onClick={onNavigate} title="Ouvrir la vue détaillée">
            {squad.name} ↗
          </button>
          <span className="orc-squad-stat orc-muted">{done}/{total} terminés · {running} en cours</span>
        </div>
        <p className="orc-squad-goal">{squad.goal}</p>
        {/* Barre de progression globale */}
        <div className="orc-squad-bar">
          <div className="orc-squad-fill" style={{ width: `${progress}%` }} />
          <span className="orc-squad-pct">{progress}%</span>
        </div>
        {/* Broadcast */}
        <form className="orc-broadcast" onSubmit={handleBroadcast}>
          <input
            className="orc-broadcast-input"
            placeholder="Message à tous les agents…"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <button type="submit" className="orc-broadcast-btn">Envoyer</button>
          {feedback && <span className="orc-broadcast-fb">{feedback}</span>}
        </form>
      </div>

      {/* Grille des membres */}
      <div className="orc-members-grid">
        {squad.members.map((m) => (
          <MemberCard key={m.id || m.name} member={m} output={outputs[m.id] || ''} />
        ))}
      </div>

      {/* Git diff du répertoire du squad */}
      {squad.directory && (
        <div className="orc-squad-git">
          <GitSummary directory={squad.directory} />
        </div>
      )}
    </div>
  );
}

/* ── Carte terminal standalone ───────────────────────────────────── */
function TerminalCard({ terminal, output, onNavigate }) {
  const lines = lastLines(output, 5);
  const color = STATUS_COLOR[terminal.status] || '#64748b';

  return (
    <div className="orc-term" style={{ borderLeftColor: color }}>
      <div className="orc-term-header">
        <span className="orc-term-name">{terminal.name}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="orc-member-badge" style={{ background: color }}>{terminal.status}</span>
          <button className="orc-nav-btn" onClick={onNavigate} title="Ouvrir dans Terminaux">↗</button>
        </div>
      </div>
      {terminal.directory && (
        <div className="orc-term-dir">{terminal.directory}</div>
      )}
      <pre className="orc-member-output">{lines || '…'}</pre>
      <div className="orc-squad-git" style={{ marginTop: 6 }}>
        <GitSummary directory={terminal.directory} />
      </div>
    </div>
  );
}

/* ── Conflit ─────────────────────────────────────────────────────── */
function ConflictRow({ conflict }) {
  const [feedback, setFeedback] = useState('');

  const notify = async () => {
    await fetch('/api/conflicts/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions: conflict.sessions, message: `⚠ Conflit sur ${conflict.path || conflict.directory}` }),
    });
    setFeedback('✓ Notifié');
    setTimeout(() => setFeedback(''), 2500);
  };

  const sev = conflict.severity === 'error' ? '#ef4444' : '#f59e0b';

  return (
    <div className="orc-conflict" style={{ borderLeftColor: sev }}>
      <div className="orc-conflict-main">
        <span className="orc-conflict-icon" style={{ color: sev }}>⚠</span>
        <div>
          <div className="orc-conflict-type">{conflict.type}</div>
          <div className="orc-conflict-path">{conflict.path || conflict.directory}</div>
          {conflict.sessions?.length > 0 && (
            <div className="orc-muted" style={{ fontSize: 11 }}>Sessions : {conflict.sessions.join(', ')}</div>
          )}
        </div>
      </div>
      <button className="orc-notify-btn" onClick={notify} disabled={!!feedback}>
        {feedback || 'Notifier'}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Page principale
   ════════════════════════════════════════════════════════════════════ */
export default function Orchestrator() {
  const navigate  = useNavigate();
  const [squads,    setSquads]    = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [outputs,   setOutputs]   = useState({}); // terminalId → raw output string
  const [loading,   setLoading]   = useState(true);
  const fetchingRef = useRef(false);

  /* ── Fetch données principales ───────────────────────────────── */
  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [sq, terms, conf] = await Promise.all([
        fetch('/api/squads').then((r) => r.json()),
        fetch('/api/terminals').then((r) => r.json()),
        fetch('/api/conflicts').then((r) => r.json()),
      ]);
      setSquads(Array.isArray(sq)    ? sq.filter((s) => s.status === 'running')   : []);
      setTerminals(Array.isArray(terms) ? terms : []);
      setConflicts(Array.isArray(conf)  ? conf  : []);
      setLoading(false);
    } catch {}
    fetchingRef.current = false;
  }, []);

  /* ── Fetch outputs de tous les terminaux running ─────────────── */
  const fetchOutputs = useCallback(async (termIds) => {
    if (!termIds.length) return;
    const results = await Promise.allSettled(
      termIds.map((id) =>
        fetch(`/api/terminals/${id}/output?last=1500`).then((r) => r.json()).then((d) => [id, d.output || ''])
      )
    );
    setOutputs((prev) => {
      const idSet = new Set(termIds);
      let changed = false;
      const next = {};
      // Conserver uniquement les terminaux actifs
      for (const [k, v] of Object.entries(prev)) {
        if (idSet.has(k)) next[k] = v;
      }
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const [id, val] = r.value;
          if (next[id] !== val) { next[id] = val; changed = true; }
        }
      }
      return changed ? next : prev;
    });
  }, []);

  /* ── Init + polling 5s ───────────────────────────────────────── */
  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 5000);
    return () => clearInterval(t);
  }, [fetchAll]);

  /* ── Fetch outputs toutes les 3s pour les terminaux actifs ───── */
  useEffect(() => {
    const runningIds = terminals.filter((t) => t.status === 'running').map((t) => t.id);
    fetchOutputs(runningIds);
    const t = setInterval(() => fetchOutputs(runningIds), 3000);
    return () => clearInterval(t);
  }, [terminals, fetchOutputs]);

  /* ── WS : refresh sur events pertinents ─────────────────────── */
  useWebSocket(useCallback((event) => {
    if (event.startsWith('squad:') || event.startsWith('terminal:') || event.startsWith('conflict:'))
      fetchAll();
  }, [fetchAll]));

  if (loading) return (
    <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement…</span></div>
  );

  /* ── Calculs ─────────────────────────────────────────────────── */
  const squadMemberIds = new Set(squads.flatMap((s) => s.members.map((m) => m.id).filter(Boolean)));
  const standalone     = terminals.filter((t) => t.status === 'running' && !squadMemberIds.has(t.id));
  const totalAgents    = squads.reduce((n, s) => n + s.members.filter((m) => m.status === 'running').length, 0)
                       + standalone.length;

  return (
    <div className="orc-page">
      <div className="orc-topbar">
        <h1 style={{ margin: 0, fontSize: 22 }}>Chef d'Orchestre</h1>
        <div className="orc-kpis">
          <Kpi value={squads.length}     label="Squads actifs"    color="#8b5cf6" onClick={() => navigate('/squads')} />
          <Kpi value={totalAgents}       label="Agents en cours"  color="#10b981" />
          <Kpi value={standalone.length} label="Terminaux seuls"  color="#3b82f6" onClick={() => navigate('/terminals')} />
          <Kpi value={conflicts.length}  label="Conflits"         color={conflicts.length > 0 ? '#ef4444' : '#64748b'} onClick={() => navigate('/conflicts')} />
        </div>
      </div>

      {/* ── Squads en cours ──────────────────────────────────────── */}
      {squads.length > 0 && (
        <section className="orc-section">
          <div className="orc-section-title">Squads en cours ({squads.length})</div>
          <div className="orc-squads-list">
            {squads.map((sq) => (
              <SquadCard
                key={sq.id}
                squad={sq}
                outputs={outputs}
                onNavigate={() => navigate(`/squads/${sq.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Terminaux standalone ─────────────────────────────────── */}
      {standalone.length > 0 && (
        <section className="orc-section">
          <div className="orc-section-title">Terminaux standalone ({standalone.length})</div>
          <div className="orc-terms-grid">
            {standalone.map((t) => (
              <TerminalCard
                key={t.id}
                terminal={t}
                output={outputs[t.id] || ''}
                onNavigate={() => navigate(`/terminals?open=${t.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Conflits ─────────────────────────────────────────────── */}
      {conflicts.length > 0 && (
        <section className="orc-section">
          <div className="orc-section-title" style={{ color: '#ef4444' }}>
            ⚠ Conflits actifs ({conflicts.length})
          </div>
          <div className="orc-conflicts-list">
            {conflicts.map((c) => <ConflictRow key={`${c.type}:${c.path || c.directory || ''}`} conflict={c} />)}
          </div>
        </section>
      )}

      {/* ── État vide ────────────────────────────────────────────── */}
      {squads.length === 0 && standalone.length === 0 && conflicts.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎼</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aucun agent actif</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Lance un terminal ou un squad pour commencer.</div>
        </div>
      )}

      <style>{`
        .orc-page { display: flex; flex-direction: column; gap: 24px; }

        /* Topbar */
        .orc-topbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .orc-kpis { display: flex; gap: 10px; flex-wrap: wrap; }
        .orc-kpi { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 18px; text-align: center; min-width: 90px; transition: border-color 0.2s; }
        .orc-kpi:hover { border-color: var(--accent); }
        .orc-kpi-val { font-size: 22px; font-weight: 700; line-height: 1.2; }
        .orc-kpi-lbl { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }

        /* Sections */
        .orc-section { display: flex; flex-direction: column; gap: 12px; }
        .orc-section-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.6px; }
        .orc-muted { color: var(--text-secondary); }

        /* Squad */
        .orc-squads-list { display: flex; flex-direction: column; gap: 16px; }
        .orc-squad { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; }
        .orc-squad-header { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
        .orc-squad-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
        .orc-squad-name { background: none; border: none; font-size: 16px; font-weight: 700; color: var(--text-primary); cursor: pointer; padding: 0; }
        .orc-squad-name:hover { color: var(--accent); }
        .orc-squad-stat { font-size: 12px; }
        .orc-squad-goal { font-size: 13px; color: var(--text-secondary); margin: 0 0 8px; }
        .orc-squad-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .orc-squad-fill { height: 6px; background: var(--accent); border-radius: 3px; transition: width 0.5s; flex-shrink: 0; }
        .orc-squad-pct { font-size: 11px; color: var(--text-secondary); font-weight: 600; }
        .orc-squad-git { padding: 8px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }

        /* Broadcast */
        .orc-broadcast { display: flex; gap: 6px; align-items: center; }
        .orc-broadcast-input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; font-size: 12px; color: var(--text-primary); }
        .orc-broadcast-input:focus { outline: 1px solid var(--accent); }
        .orc-broadcast-btn { background: var(--accent); color: white; border: none; border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; white-space: nowrap; }
        .orc-broadcast-fb { font-size: 11px; color: var(--success, #10b981); font-weight: 600; }

        /* Membres */
        .orc-members-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1px; background: var(--border); }
        .orc-member { background: var(--bg-card); padding: 10px 12px; border-left: 3px solid; display: flex; flex-direction: column; gap: 4px; }
        .orc-member-header { display: flex; justify-content: space-between; align-items: center; }
        .orc-member-name { font-size: 13px; font-weight: 600; }
        .orc-member-badge { font-size: 9px; font-weight: 700; color: white; padding: 2px 7px; border-radius: 8px; text-transform: uppercase; }
        .orc-member-task { font-size: 11px; color: var(--text-secondary); margin: 0; line-height: 1.4; }
        .orc-member-output { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 10px; color: #c0caf5; background: #141520; border-radius: 4px; padding: 6px 8px; margin: 0; white-space: pre-wrap; word-break: break-all; line-height: 1.4; max-height: 80px; overflow: hidden; }
        .orc-member-bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; margin-top: 4px; }
        .orc-member-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }

        /* Terminal standalone */
        .orc-terms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
        .orc-term { background: var(--bg-card); border: 1px solid var(--border); border-left: 3px solid; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
        .orc-term-header { display: flex; justify-content: space-between; align-items: center; }
        .orc-term-name { font-size: 14px; font-weight: 600; }
        .orc-term-dir { font-family: monospace; font-size: 10px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .orc-nav-btn { background: none; border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; color: var(--text-secondary); }
        .orc-nav-btn:hover { border-color: var(--accent); color: var(--accent); }

        /* Git — panneau complet */
        .orc-git-root { width: 100%; }
        .orc-git-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 28px; }
        .orc-git-icon { font-size: 13px; color: #8b5cf6; flex-shrink: 0; }
        .orc-git-badge { font-size: 12px; font-weight: 600; }
        .orc-git-clean { font-size: 11px; color: #10b981; font-weight: 600; }
        .orc-git-muted { font-size: 11px; color: var(--text-secondary); }
        .orc-git-btn {
          background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 5px;
          padding: 3px 10px; font-size: 11px; cursor: pointer; color: var(--text-secondary);
          transition: all 0.15s; white-space: nowrap;
        }
        .orc-git-btn:hover { border-color: var(--accent); color: var(--accent); }
        .orc-git-btn-active { background: rgba(139,92,246,0.15); border-color: var(--accent); color: var(--accent); }
        .orc-git-btn:disabled { opacity: 0.5; cursor: default; }
        .orc-git-panel { overflow: hidden; transition: max-height 0.3s ease; }
        .orc-git-panel-inner { padding: 10px 0 4px; display: flex; flex-direction: column; gap: 12px; }
        .orc-git-section { display: flex; flex-direction: column; gap: 4px; }
        .orc-git-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #565f89; margin-bottom: 4px; }
        .orc-git-commit { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid #2a2b3d; align-items: baseline; }
        .orc-git-hash { font-size: 10px; color: #8b5cf6; flex-shrink: 0; font-family: monospace; }
        .orc-git-msg { font-size: 11px; color: #c0caf5; }

        /* Conflits */
        .orc-conflicts-list { display: flex; flex-direction: column; gap: 8px; }
        .orc-conflict { background: var(--bg-card); border: 1px solid var(--border); border-left: 3px solid; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .orc-conflict-main { display: flex; align-items: flex-start; gap: 10px; }
        .orc-conflict-icon { font-size: 16px; }
        .orc-conflict-type { font-size: 13px; font-weight: 600; }
        .orc-conflict-path { font-family: monospace; font-size: 11px; color: var(--text-secondary); }
        .orc-notify-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--text-secondary); white-space: nowrap; }
        .orc-notify-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .orc-notify-btn:disabled { color: var(--success, #10b981); border-color: var(--success, #10b981); }
      `}</style>
    </div>
  );
}

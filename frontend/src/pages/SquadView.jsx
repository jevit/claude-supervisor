import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../services/websocket';
import { useToast } from '../components/Toast';

const cleanAnsi = (s) => (s || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); // eslint-disable-line no-control-regex

const STATUS_COLORS = {
  running:   'var(--accent)',
  completed: 'var(--success, #10b981)',
  exited:    'var(--success, #10b981)',
  waiting:   '#64748b',
  error:     'var(--error, #ef4444)',
  cancelled: 'var(--warning, #f59e0b)',
};

const STATUS_LABELS = {
  running:   'En cours',
  completed: 'Terminé',
  exited:    'Sorti',
  waiting:   'En attente',
  error:     'Erreur',
  cancelled: 'Annulé',
};

/* ── Durée formatée ─────────────────────────────────────────────── */
function fmtElapsed(since) {
  if (!since) return null;
  const s = Math.floor((Date.now() - new Date(since)) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${(s % 60).toString().padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}`;
}

/* ── Panneau d'un agent ─────────────────────────────────────────── */
function MemberPanel({ member, squadId, onKilled, addToast }) {
  const navigate    = useNavigate();
  const [output,    setOutput]    = useState('');
  const [expanded,  setExpanded]  = useState(false);
  const [flash,     setFlash]     = useState(false); // indicateur d'activité
  const [cmd,       setCmd]       = useState('');
  const [sending,   setSending]   = useState(false);
  const [retrying,  setRetrying]  = useState(false);
  const [elapsed,   setElapsed]   = useState(fmtElapsed(member.startedAt));
  const outputRef  = useRef(null);
  const prevOutput = useRef('');

  // Horloge temps écoulé (mise à jour toutes les 5s)
  useEffect(() => {
    if (member.status !== 'running' || !member.startedAt) return;
    const t = setInterval(() => setElapsed(fmtElapsed(member.startedAt)), 5000);
    return () => clearInterval(t);
  }, [member.status, member.startedAt]);

  // Charger l'output initial
  useEffect(() => {
    if (!member.id || member.status === 'waiting') return;
    fetch(`/api/terminals/${member.id}/output?last=5000`)
      .then((r) => r.json())
      .then((data) => {
        if (data.output) {
          const lines = cleanAnsi(data.output).split('\n').filter((l) => l.trim());
          const text  = lines.slice(-30).join('\n');
          prevOutput.current = text;
          setOutput(text);
        }
      })
      .catch(() => {});
  }, [member.id, member.status]);

  // Recevoir l'output en push via WS (#16) — remplace le poll 3s
  useWebSocket(useCallback((evt, data) => {
    if (evt !== 'terminal:output' || data?.terminalId !== member.id) return;
    if (!data?.data) return;

    const chunk = cleanAnsi(data.data);
    setOutput((prev) => {
      const combined = prev + chunk;
      // Garder les 30 dernières lignes non-vides
      const lines = combined.split('\n').filter((l) => l.trim());
      return lines.slice(-30).join('\n');
    });

    // Flash d'activité
    setFlash(true);
    setTimeout(() => setFlash(false), 600);

    // Parser des patterns de progression (#16) : "Step N/M", "N%", "X/Y"
    const match = chunk.match(/\bstep\s+(\d+)\s*\/\s*(\d+)\b/i)
      || chunk.match(/\b(\d{1,3})%/)
      || chunk.match(/\b(\d+)\s*\/\s*(\d+)\b/);
    if (match) {
      let pct;
      if (match[2]) {
        pct = Math.round((parseInt(match[1], 10) / parseInt(match[2], 10)) * 100);
      } else {
        pct = Math.min(parseInt(match[1], 10), 99);
      }
      if (pct > 0 && pct <= 100) {
        fetch(`/api/squads/${squadId}/members/${encodeURIComponent(member.name)}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ progress: pct }),
        }).catch(() => {});
      }
    }
  }, [member.id, member.name, squadId]));

  // Auto-scroll vers le bas quand l'output change
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output]);

  const sendCmd = async () => {
    if (!cmd.trim() || !member.id) return;
    setSending(true);
    await fetch(`/api/terminals/${member.id}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: cmd + '\n' }),
    }).catch(() => {});
    setCmd('');
    setSending(false);
  };

  const killMember = async () => {
    if (!member.id) return;
    await fetch(`/api/terminals/${member.id}`, { method: 'DELETE' }).catch(() => {});
    onKilled?.();
  };

  const retryMember = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/squads/${squadId}/members/${encodeURIComponent(member.name)}/retry`, { method: 'POST' });
      if (res.ok) {
        addToast?.(`↺ Retry lancé pour ${member.name}`, 'info');
      } else {
        addToast?.(`Erreur retry ${member.name}`, 'error');
      }
    } catch {
      addToast?.(`Erreur retry ${member.name}`, 'error');
    }
    setRetrying(false);
    onKilled?.(); // force refresh
  };

  return (
    <div className={`member-panel member-${member.status} ${flash ? 'member-flash' : ''}`}>
      {/* Header */}
      <div className="member-header">
        <div className="member-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {member.status === 'running' && (
              <span className="member-activity-dot" title="Actif" />
            )}
            <span className="member-name">{member.isCoordinator ? '🎼 ' : ''}{member.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {elapsed && member.status === 'running' && (
              <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{elapsed}</span>
            )}
            <span className="member-badge" style={{ background: STATUS_COLORS[member.status] }}>
              {STATUS_LABELS[member.status] || member.status}
            </span>
          </div>
        </div>
        <div className="member-progress-bar">
          <div className="member-progress-fill"
            style={{ width: `${member.progress || 0}%`, background: STATUS_COLORS[member.status] }} />
        </div>
      </div>

      {/* Tâche */}
      <p className="member-task">{member.task}</p>

      {/* Dépendances en attente */}
      {member.status === 'waiting' && member.dependsOn?.length > 0 && (
        <div className="member-waiting-info">
          <span className="member-waiting-icon">⏱</span>
          <span>En attente de : </span>
          {member.dependsOn.map((dep) => (
            <span key={dep} className="member-dep-tag">{dep}</span>
          ))}
        </div>
      )}

      {/* Output terminal (#4: bouton copier) */}
      <div style={{ position: 'relative' }}>
        <div
          ref={outputRef}
          className="member-terminal"
          onClick={() => member.status !== 'waiting' && setExpanded(!expanded)}
          style={{ maxHeight: expanded ? 500 : 180, opacity: member.status === 'waiting' ? 0.4 : 1, overflowY: 'auto' }}
        >
          <pre className="member-output">
            {member.status === 'waiting'
              ? `En attente de : ${member.dependsOn?.join(', ')}…`
              : (output || 'En attente de sortie...')}
          </pre>
        </div>
        {output && (
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(output).catch(() => {}); }}
            title="Copier la sortie"
            style={{
              position: 'absolute', top: 4, right: 4,
              background: 'rgba(26,27,38,0.8)', border: '1px solid #2a2b3d',
              borderRadius: 4, color: '#a9b1d6', cursor: 'pointer',
              fontSize: 10, padding: '2px 6px', opacity: 0.6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          >
            📋
          </button>
        )}
      </div>

      {/* Footer : actions */}
      <div className="member-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {member.id && (
            <span className="member-id" title={member.id}>{member.id.substring(0, 8)}</span>
          )}
          {member.completedAt && (
            <span className="member-time">
              Terminé à {new Date(member.completedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {member.id && (
            <button
              className="member-action-btn"
              onClick={() => navigate(`/terminals?open=${member.id}`)}
              title="Ouvrir dans Terminaux"
            >
              ↗ Terminal
            </button>
          )}
          {/* Retry pour les membres en erreur ou sortis (#12) */}
          {(member.status === 'error' || member.status === 'exited') && (
            <button
              className="member-action-btn"
              onClick={retryMember}
              disabled={retrying}
              title="Relancer cet agent"
              style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)', opacity: retrying ? 0.5 : 1 }}
            >
              {retrying ? '…' : '↺ Retry'}
            </button>
          )}
          {member.status === 'running' && member.id && (
            <>
              <button
                className="member-action-btn"
                onClick={() => fetch(`/api/terminals/${member.id}/write`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ data: '\x03' }), // Ctrl+C (#17)
                }).catch(() => {})}
                title="Envoyer Ctrl+C (interrompre sans tuer)"
              >
                ⏸ Pause
              </button>
              <button
                className="member-action-btn member-action-danger"
                onClick={killMember}
                title="Arrêter cet agent"
              >
                ✕ Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Envoyer une commande individuelle */}
      {member.status === 'running' && member.id && (
        <div className="member-cmd-row">
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCmd()}
            placeholder="Commande…"
            className="member-cmd-input"
          />
          <button
            onClick={sendCmd}
            disabled={!cmd.trim() || sending}
            className="member-cmd-btn"
          >
            {sending ? '…' : '↵'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Graphe de dépendances SVG (#75) ────────────────────────────── */
function DependencyGraph({ members }) {
  if (!members || members.length <= 1) return null;

  const getDepth = (name, visited = new Set()) => {
    if (visited.has(name)) return 0;
    visited.add(name);
    const m = members.find((x) => x.name === name);
    if (!m || !m.dependsOn?.length) return 0;
    return 1 + Math.max(...m.dependsOn.map((d) => getDepth(d, new Set(visited))));
  };

  const depthMap = {};
  members.forEach((m) => { depthMap[m.name] = getDepth(m.name); });

  const maxDepth = Math.max(...Object.values(depthMap));
  const NODE_W = 110, NODE_H = 34, PAD = 20, GAP_X = 56, GAP_Y = 14;

  const layers = {};
  members.forEach((m) => {
    const d = depthMap[m.name] || 0;
    if (!layers[d]) layers[d] = [];
    layers[d].push(m);
  });

  const positions = {};
  Object.entries(layers).forEach(([d, layerMembers]) => {
    layerMembers.forEach((m, i) => {
      positions[m.name] = {
        x: PAD + Number(d) * (NODE_W + GAP_X),
        y: PAD + i * (NODE_H + GAP_Y),
      };
    });
  });

  const statusColor = (s) => ({ running: '#8b5cf6', completed: '#10b981', exited: '#10b981', waiting: '#64748b', error: '#ef4444', cancelled: '#f59e0b' }[s] || '#64748b');

  const totalW = PAD * 2 + (maxDepth + 1) * (NODE_W + GAP_X) - GAP_X;
  const totalH = PAD * 2 + Math.max(...Object.values(positions).map((p) => p.y)) + NODE_H;

  return (
    <details style={{ marginBottom: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: '#565f89', userSelect: 'none', padding: '4px 0' }}>
        ↳ Graphe de dépendances
      </summary>
      <div style={{ overflowX: 'auto', padding: '8px 0' }}>
        <svg width={totalW} height={totalH} style={{ display: 'block' }}>
          <defs>
            <marker id="sv-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 Z" fill="rgba(139,92,246,0.55)" />
            </marker>
          </defs>
          {/* Flèches */}
          {members.map((m) =>
            (m.dependsOn || []).map((depName) => {
              const from = positions[depName];
              const to   = positions[m.name];
              if (!from || !to) return null;
              const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
              const x2 = to.x,            y2 = to.y  + NODE_H / 2;
              const mx = (x1 + x2) / 2;
              return (
                <path key={`${depName}->${m.name}`}
                  d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                  fill="none" stroke="rgba(139,92,246,0.35)" strokeWidth={1.5}
                  markerEnd="url(#sv-arrow)" />
              );
            })
          )}
          {/* Nœuds */}
          {members.map((m) => {
            const pos = positions[m.name];
            if (!pos) return null;
            const color = statusColor(m.status);
            const label = m.name.length > 14 ? m.name.slice(0, 12) + '…' : m.name;
            return (
              <g key={m.name}>
                <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={6}
                  fill={`${color}18`} stroke={color} strokeWidth={1.5} />
                <text x={pos.x + NODE_W / 2} y={pos.y + NODE_H / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={color} fontSize={11} fontWeight={600} fontFamily="monospace">
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </details>
  );
}

/* ── Diagramme Gantt SVG (#29) ───────────────────────────────────── */
function GanttChart({ squad }) {
  const members = (squad.members || []).filter((m) => !m.isCoordinator && m.startedAt);
  if (members.length === 0) return null;

  const squadStart = new Date(squad.createdAt).getTime();
  const now        = Date.now();
  const squadEnd   = squad.completedAt ? new Date(squad.completedAt).getTime() : now;
  const totalMs    = Math.max(squadEnd - squadStart, 1000);

  const STATUS_FILL = { completed: '#10b981', running: '#8b5cf6', exited: '#f59e0b', error: '#ef4444', cancelled: '#565f89', waiting: '#2a2b3d' };

  const W = 480; // largeur SVG
  const ROW = 20;
  const PAD = { top: 8, left: 100, right: 12, bottom: 8 };
  const barW = W - PAD.left - PAD.right;
  const H = PAD.top + members.length * ROW + PAD.bottom;

  function xOf(ms) { return PAD.left + (ms / totalMs) * barW; }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        Chronologie des agents
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {members.map((m, i) => {
          const y = PAD.top + i * ROW;
          const start = Math.max(0, new Date(m.startedAt).getTime() - squadStart);
          const end   = m.completedAt
            ? new Date(m.completedAt).getTime() - squadStart
            : (m.status === 'running' ? now - squadStart : start + 500);
          const x1 = xOf(start);
          const x2 = Math.max(x1 + 4, xOf(end));
          const fill = STATUS_FILL[m.status] || '#565f89';
          return (
            <g key={m.name}>
              <text x={PAD.left - 4} y={y + 13} textAnchor="end" fontSize={10} fill="#a9b1d6"
                style={{ fontFamily: 'monospace' }}>
                {m.name.length > 13 ? m.name.slice(0, 12) + '…' : m.name}
              </text>
              <rect x={x1} y={y + 3} width={x2 - x1} height={ROW - 6} rx={3} fill={fill} opacity={0.85} />
            </g>
          );
        })}
        {/* Ligne "now" si le squad est en cours */}
        {!squad.completedAt && (
          <line x1={xOf(now - squadStart)} y1={PAD.top} x2={xOf(now - squadStart)} y2={H - PAD.bottom}
            stroke="#8b5cf6" strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
        )}
      </svg>
    </div>
  );
}

/* ── Bannière coordinateur avec instructions (#14) ───────────────── */
function CoordinatorBanner({ member: m, navigate }) {
  const [messages, setMessages] = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!m.id) return;
    fetch(`/api/messages?from=${encodeURIComponent(m.id)}&limit=20`)
      .then((r) => r.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [m.id]);

  return (
    <div style={{
      background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
      borderRadius: 8, padding: '8px 16px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>🎼</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Coordinateur</span>
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>{STATUS_LABELS[m.status] || m.status}</span>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setExpanded((v) => !v)}
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>
            {expanded ? '▲' : `📨 ${messages.length} instruction${messages.length > 1 ? 's' : ''}`}
          </button>
        )}
        {m.id && (
          <button className="member-action-btn" onClick={() => navigate(`/terminals?open=${m.id}`)}>
            ↗ Terminal
          </button>
        )}
      </div>
      {expanded && messages.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '4px 8px', fontSize: 12 }}>
              <span style={{ color: '#8b5cf6', fontFamily: 'monospace', fontSize: 10 }}>→ {msg.to}</span>
              <span style={{ color: '#565f89', fontSize: 10, marginLeft: 8 }}>{new Date(msg.timestamp).toLocaleTimeString('fr-FR')}</span>
              <div style={{ color: '#c0caf5', marginTop: 2, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Page principale SquadView
   ════════════════════════════════════════════════════════════════════ */
export default function SquadView() {
  const addToast = useToast();
  const { id }  = useParams();
  const navigate = useNavigate();
  const [squad,           setSquad]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [broadcastMsg,    setBroadcastMsg]     = useState('');
  const [broadcastFeedback, setBroadcastFeedback] = useState('');
  const [elapsedTick,     setElapsedTick]     = useState(0);
  const [selectedMembers, setSelectedMembers] = useState(new Set()); // sélection pour broadcast ciblé (#76)

  const fetchSquad = useCallback(() => {
    fetch(`/api/squads/${id}`)
      .then((r) => r.json())
      .then((data) => { setSquad(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchSquad();
    let t = setInterval(fetchSquad, 5000);
    const onVisibility = () => {
      if (document.hidden) { clearInterval(t); t = null; }
      else { clearInterval(t); fetchSquad(); t = setInterval(fetchSquad, 5000); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisibility); };
  }, [fetchSquad]);

  // Tick pour mettre à jour les durées affichées
  useEffect(() => {
    const t = setInterval(() => setElapsedTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  useWebSocket(useCallback((event, data) => {
    if (event.startsWith('squad:') && data?.id === id) fetchSquad();
    if (event === 'terminal:exited') fetchSquad();
  }, [id, fetchSquad]));

  async function handleCancel() {
    await fetch(`/api/squads/${id}`, { method: 'DELETE' });
    fetchSquad();
  }

  async function handleBroadcast(e) {
    e.preventDefault();
    if (!broadcastMsg.trim() || !squad) return;
    // Broadcast ciblé (#76) : si des membres sont sélectionnés, écrire directement dans leurs terminaux
    try {
      if (selectedMembers.size > 0) {
        const targets = squad.members.filter((m) => selectedMembers.has(m.name) && m.id && m.status === 'running');
        await Promise.allSettled(targets.map((m) =>
          fetch(`/api/terminals/${m.id}/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: broadcastMsg.trim() + '\n' }),
          })
        ));
        addToast(`📡 Envoyé à ${targets.length} agent(s) sélectionné(s)`, 'success');
        setBroadcastFeedback(`Envoyé à ${targets.length} agent(s) sélectionné(s)`);
      } else {
        const res = await fetch(`/api/squads/${id}/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: broadcastMsg.trim() }),
        });
        const data = await res.json();
        addToast(`📡 Envoyé à ${data.sent} agent(s)`, 'success');
        setBroadcastFeedback(`Envoyé à ${data.sent} agent(s)`);
      }
    } catch {
      addToast('Erreur lors du broadcast', 'error');
    }
    setBroadcastMsg('');
    setTimeout(() => setBroadcastFeedback(''), 5000);
  }

  const toggleMemberSelect = (name) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="loading-placeholder">
        <div className="loading-spinner" />
        <span>Chargement du squad...</span>
      </div>
    );
  }

  if (!squad) {
    return (
      <div>
        <h1>Squad introuvable</h1>
        <button onClick={() => navigate('/squads')} className="back-btn">Retour aux squads</button>
      </div>
    );
  }

  const { workers, running, waiting, done, total, avgProgress } = useMemo(() => {
    const workers = squad.members.filter((m) => !m.isCoordinator);
    const running = workers.filter((m) => m.status === 'running').length;
    const waiting = workers.filter((m) => m.status === 'waiting').length;
    const done    = workers.filter((m) => m.status === 'completed' || m.status === 'exited').length;
    const total   = workers.length;
    const avgProgress = total > 0
      ? Math.round(workers.reduce((s, m) => s + (m.progress || 0), 0) / total)
      : 0;
    return { workers, running, waiting, done, total, avgProgress };
  }, [squad.members]);

  // Durée totale du squad
  const squadElapsed = squad.startedAt ? fmtElapsed(squad.startedAt) : null;

  return (
    <div>
      {/* Header */}
      <div className="squad-header">
        <div className="squad-header-top">
          <button className="back-btn" onClick={() => navigate('/squads')}>← Squads</button>
          <h1 className="squad-title">{squad.name}</h1>
          <span className="squad-status-badge" style={{ color: STATUS_COLORS[squad.status] }}>
            {squad.status.toUpperCase()}
          </span>
          {squadElapsed && squad.status === 'running' && (
            <span style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
              ⏱ {squadElapsed}
            </span>
          )}
          {squad.mode === 'rolling' && (
            <span style={{ fontSize: 11, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10, color: '#8b5cf6', padding: '2px 8px', fontWeight: 600 }}>
              🔄 Rolling{squad.rollingIteration > 0 ? ` #${squad.rollingIteration}` : ''}
            </span>
          )}
          {squad.status === 'running' && (
            <button className="squad-cancel-btn" onClick={handleCancel}>Annuler le squad</button>
          )}
        </div>
        <p className="squad-goal">{squad.goal}</p>

        {/* Stats + barre de progression */}
        <div className="squad-stats">
          <div className="squad-global-progress">
            <div className="squad-global-bar">
              <div className="squad-global-fill" style={{ width: `${avgProgress}%` }} />
            </div>
            <span>
              {avgProgress}% — {done}/{total} terminé(s)
              {running > 0 && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>● {running} en cours</span>}
              {waiting > 0 && <span style={{ color: '#64748b', marginLeft: 8 }}>⏱ {waiting} en attente</span>}
            </span>
          </div>

          {/* Broadcast ciblé (#76) — toujours visible, désactivé si squad terminé */}
          <form className="squad-broadcast-form" onSubmit={handleBroadcast}
            style={{ opacity: squad.status === 'running' ? 1 : 0.45 }}
          >
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
              📡 {squad.status !== 'running' ? 'Squad terminé —' : selectedMembers.size > 0 ? `Sélectionnés (${selectedMembers.size}) :` : 'Tous les agents :'}
            </span>
            <input className="squad-broadcast-input"
              disabled={squad.status !== 'running'}
              placeholder={squad.status !== 'running' ? 'Broadcast indisponible' : selectedMembers.size > 0 ? 'Message aux sélectionnés…' : 'Message à tous les agents…'}
              value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} />
            <button type="submit" className="squad-broadcast-btn" disabled={squad.status !== 'running'}>Envoyer</button>
            {selectedMembers.size > 0 && squad.status === 'running' && (
              <button type="button" onClick={() => setSelectedMembers(new Set())} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}>✕ désélectionner</button>
            )}
            {broadcastFeedback && <span className="squad-broadcast-fb">{broadcastFeedback}</span>}
          </form>
        </div>
      </div>

      {/* Graphe de dépendances (#75) */}
      {workers.length > 1 && workers.some((m) => m.dependsOn?.length > 0) && (
        <DependencyGraph members={workers} />
      )}

      {/* Diagramme Gantt (#29) */}
      <GanttChart squad={squad} />

      {/* Coordinateur (si présent) en banner séparé (#14) */}
      {squad.members.filter((m) => m.isCoordinator).map((m) => (
        <CoordinatorBanner key={m.id || 'coord'} member={m} navigate={navigate} />
      ))}

      {/* Grille des agents workers */}
      <div className="members-grid">
        {workers.map((m) => (
          <div key={m.id || m.name} style={{ position: 'relative' }}>
            {/* Checkbox de sélection pour broadcast ciblé (#76) */}
            {m.status === 'running' && m.id && (
              <label style={{
                position: 'absolute', top: 8, right: 8, zIndex: 2,
                display: 'flex', alignItems: 'center', gap: 4,
                cursor: 'pointer', fontSize: 10, color: '#565f89',
              }}>
                <input type="checkbox"
                  checked={selectedMembers.has(m.name)}
                  onChange={() => toggleMemberSelect(m.name)}
                  style={{ cursor: 'pointer' }}
                />
                cibler
              </label>
            )}
            <MemberPanel member={m} squadId={id} onKilled={fetchSquad} addToast={addToast} />
          </div>
        ))}
      </div>

      <style>{`
        .squad-header { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 16px; }
        .squad-header-top { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
        .back-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; cursor: pointer; color: var(--text-secondary); font-size: 13px; }
        .back-btn:hover { background: var(--border); color: var(--text-primary); }
        .squad-title { font-size: 20px; margin: 0; flex: 1; }
        .squad-status-badge { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .squad-cancel-btn { background: var(--error, #ef4444); color: white; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; margin-left: auto; }
        .squad-cancel-btn:hover { filter: brightness(1.1); }
        .squad-goal { font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }
        .squad-stats { display: flex; flex-direction: column; gap: 10px; }
        .squad-global-progress { display: flex; align-items: center; gap: 12px; }
        .squad-global-bar { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; max-width: 300px; }
        .squad-global-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.5s; }
        .squad-global-progress span { font-size: 13px; color: var(--text-secondary); }
        .squad-broadcast-form { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .squad-broadcast-input { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 13px; color: var(--text-primary); width: 260px; }
        .squad-broadcast-input:focus { outline: 1px solid var(--accent); }
        .squad-broadcast-btn { background: var(--accent); color: white; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
        .squad-broadcast-fb { font-size: 12px; color: var(--success, #10b981); }
        .members-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
        .member-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.2s; }
        .member-panel.member-flash { box-shadow: 0 0 0 2px rgba(139,92,246,0.35); }
        .member-panel.member-running { border-left: 3px solid var(--accent); }
        .member-panel.member-completed, .member-panel.member-exited { border-left: 3px solid var(--success, #10b981); }
        .member-panel.member-error { border-left: 3px solid var(--error, #ef4444); }
        .member-panel.member-cancelled { border-left: 3px solid var(--warning, #f59e0b); }
        .member-panel.member-waiting { border-left: 3px solid #64748b; opacity: 0.85; }
        .member-activity-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); display: inline-block; animation: pulse-dot 1.5s ease-in-out infinite; flex-shrink: 0; }
        @keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.75); } }
        .member-waiting-info { display: flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 12px; color: #64748b; flex-wrap: wrap; }
        .member-waiting-icon { font-size: 14px; }
        .member-dep-tag { background: rgba(100,116,139,0.15); border: 1px solid #64748b; border-radius: 4px; padding: 1px 7px; font-size: 11px; font-weight: 600; }
        .member-header { padding: 12px 14px 8px; }
        .member-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .member-name { font-weight: 600; font-size: 14px; }
        .member-badge { color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
        .member-progress-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .member-progress-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
        .member-task { font-size: 12px; color: var(--text-secondary); padding: 0 14px 8px; margin: 0; line-height: 1.4; }
        .member-terminal { background: #1a1b26; cursor: pointer; overflow-y: auto; transition: max-height 0.3s; flex: 1; min-height: 80px; }
        .member-output { padding: 8px 12px; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 11px; color: #c0caf5; margin: 0; white-space: pre-wrap; word-break: break-all; line-height: 1.4; }
        .member-footer { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px 6px 14px; font-size: 10px; color: var(--text-secondary); border-top: 1px solid var(--border); }
        .member-id { font-family: monospace; }
        .member-time { font-family: monospace; }
        .member-action-btn { background: none; border: 1px solid var(--border); border-radius: 5px; padding: 2px 9px; font-size: 11px; cursor: pointer; color: var(--text-secondary); }
        .member-action-btn:hover { border-color: var(--accent); color: var(--accent); }
        .member-action-danger:hover { border-color: var(--error, #ef4444) !important; color: var(--error, #ef4444) !important; }
        .member-cmd-row { display: flex; gap: 4px; padding: 6px 10px; border-top: 1px solid var(--border); background: rgba(255,255,255,0.02); }
        .member-cmd-input { flex: 1; background: #1a1b26; border: 1px solid #2d3148; border-radius: 4px; padding: 4px 8px; color: #c0caf5; font-size: 11px; font-family: monospace; }
        .member-cmd-input:focus { outline: 1px solid var(--accent); }
        .member-cmd-btn { background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3); border-radius: 4px; color: var(--accent); cursor: pointer; font-size: 13px; font-weight: 700; padding: 2px 10px; }
        .member-cmd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

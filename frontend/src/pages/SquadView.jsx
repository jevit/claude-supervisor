import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../services/websocket';

const STATUS_COLORS = {
  running: 'var(--accent)',
  completed: 'var(--success, #10b981)',
  exited: 'var(--success, #10b981)',
  error: 'var(--error, #ef4444)',
  cancelled: 'var(--warning, #f59e0b)',
};

const STATUS_LABELS = {
  running: 'En cours',
  completed: 'Termine',
  exited: 'Sorti',
  error: 'Erreur',
  cancelled: 'Annule',
};

function MemberPanel({ member }) {
  const [output, setOutput] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Charger les dernieres lignes de sortie du terminal
  useEffect(() => {
    if (!member.id) return;
    const fetchOutput = () => {
      fetch(`/api/terminals/${member.id}/output?last=3000`)
        .then((r) => r.json())
        .then((data) => {
          if (data.output) {
            // Garder les 25 dernieres lignes (nettoyer les codes ANSI)
            const clean = data.output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
            const lines = clean.split('\n').filter((l) => l.trim());
            setOutput(lines.slice(-25).join('\n'));
          }
        })
        .catch(() => {});
    };
    fetchOutput();
    const t = setInterval(fetchOutput, 3000);
    return () => clearInterval(t);
  }, [member.id]);

  return (
    <div className={`member-panel member-${member.status}`}>
      <div className="member-header">
        <div className="member-info">
          <span className="member-name">{member.name}</span>
          <span className="member-badge" style={{ background: STATUS_COLORS[member.status] }}>
            {STATUS_LABELS[member.status] || member.status}
          </span>
        </div>
        <div className="member-progress-bar">
          <div className="member-progress-fill"
            style={{ width: `${member.progress || 0}%`, background: STATUS_COLORS[member.status] }} />
        </div>
      </div>
      <p className="member-task">{member.task}</p>
      <div className="member-terminal" onClick={() => setExpanded(!expanded)}
        style={{ maxHeight: expanded ? 600 : 200 }}>
        <pre className="member-output">{output || 'En attente de sortie...'}</pre>
      </div>
      {member.id && (
        <div className="member-footer">
          <span className="member-id">ID: {member.id.substring(0, 8)}</span>
          {member.completedAt && (
            <span className="member-time">
              Termine a {new Date(member.completedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SquadView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [squad, setSquad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastFeedback, setBroadcastFeedback] = useState('');

  const fetchSquad = useCallback(() => {
    fetch(`/api/squads/${id}`)
      .then((r) => r.json())
      .then((data) => { setSquad(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchSquad();
    const t = setInterval(fetchSquad, 5000);
    return () => clearInterval(t);
  }, [fetchSquad]);

  useWebSocket(useCallback((event, data) => {
    if (event.startsWith('squad:') && data?.id === id) fetchSquad();
    if (event === 'terminal:output' || event === 'terminal:exited') fetchSquad();
  }, [id, fetchSquad]));

  async function handleCancel() {
    await fetch(`/api/squads/${id}`, { method: 'DELETE' });
    fetchSquad();
  }

  async function handleBroadcast(e) {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    const res = await fetch(`/api/squads/${id}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: broadcastMsg.trim() }),
    });
    const data = await res.json();
    setBroadcastFeedback(`Envoye a ${data.sent} agent(s)`);
    setBroadcastMsg('');
    setTimeout(() => setBroadcastFeedback(''), 3000);
  }

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

  const running = squad.members.filter((m) => m.status === 'running').length;
  const done = squad.members.filter((m) => m.status === 'completed' || m.status === 'exited').length;
  const total = squad.members.length;
  const avgProgress = total > 0
    ? Math.round(squad.members.reduce((s, m) => s + (m.progress || 0), 0) / total)
    : 0;

  return (
    <div>
      {/* Header du squad */}
      <div className="squad-header">
        <div className="squad-header-top">
          <button className="back-btn" onClick={() => navigate('/squads')}>← Squads</button>
          <h1 className="squad-title">{squad.name}</h1>
          <span className="squad-status-badge" style={{ color: STATUS_COLORS[squad.status] }}>
            {squad.status.toUpperCase()}
          </span>
          {squad.status === 'running' && (
            <button className="squad-cancel-btn" onClick={handleCancel}>Annuler le squad</button>
          )}
        </div>
        <p className="squad-goal">{squad.goal}</p>
        <div className="squad-stats">
          <div className="squad-global-progress">
            <div className="squad-global-bar">
              <div className="squad-global-fill" style={{ width: `${avgProgress}%` }} />
            </div>
            <span>{avgProgress}% — {done}/{total} termine(s), {running} en cours</span>
          </div>
          {squad.status === 'running' && (
            <form className="squad-broadcast-form" onSubmit={handleBroadcast}>
              <input className="squad-broadcast-input" placeholder="Message a tous les agents..."
                value={broadcastMsg} onChange={(e) => setBroadcastMsg(e.target.value)} />
              <button type="submit" className="squad-broadcast-btn">Envoyer</button>
              {broadcastFeedback && <span className="squad-broadcast-fb">{broadcastFeedback}</span>}
            </form>
          )}
        </div>
      </div>

      {/* Grille des membres */}
      <div className="members-grid">
        {squad.members.map((m) => (
          <MemberPanel key={m.id || m.name} member={m} />
        ))}
      </div>

      <style>{`
        .squad-header { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
        .squad-header-top { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
        .back-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 6px 12px; cursor: pointer; color: var(--text-secondary); font-size: 13px; }
        .back-btn:hover { background: var(--border); color: var(--text-primary); }
        .squad-title { font-size: 20px; margin: 0; flex: 1; }
        .squad-status-badge { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .squad-cancel-btn { background: var(--error, #ef4444); color: white; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
        .squad-cancel-btn:hover { filter: brightness(1.1); }
        .squad-goal { font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }
        .squad-stats { display: flex; flex-direction: column; gap: 10px; }
        .squad-global-progress { display: flex; align-items: center; gap: 12px; }
        .squad-global-bar { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; max-width: 300px; }
        .squad-global-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.5s; }
        .squad-global-progress span { font-size: 13px; color: var(--text-secondary); }
        .squad-broadcast-form { display: flex; gap: 6px; align-items: center; }
        .squad-broadcast-input { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 13px; color: var(--text-primary); width: 250px; }
        .squad-broadcast-input:focus { outline: 1px solid var(--accent); }
        .squad-broadcast-btn { background: var(--accent); color: white; border: none; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
        .squad-broadcast-fb { font-size: 12px; color: var(--success, #10b981); }
        .members-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
        .member-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
        .member-panel.member-running { border-left: 3px solid var(--accent); }
        .member-panel.member-completed, .member-panel.member-exited { border-left: 3px solid var(--success, #10b981); }
        .member-panel.member-error { border-left: 3px solid var(--error, #ef4444); }
        .member-panel.member-cancelled { border-left: 3px solid var(--warning, #f59e0b); }
        .member-header { padding: 12px 14px 8px; }
        .member-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .member-name { font-weight: 600; font-size: 14px; }
        .member-badge { color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
        .member-progress-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .member-progress-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
        .member-task { font-size: 12px; color: var(--text-secondary); padding: 0 14px 8px; margin: 0; line-height: 1.4; }
        .member-terminal { background: #1a1b26; cursor: pointer; overflow: hidden; transition: max-height 0.3s; flex: 1; min-height: 100px; }
        .member-output { padding: 8px 12px; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 11px; color: #c0caf5; margin: 0; white-space: pre-wrap; word-break: break-all; line-height: 1.4; }
        .member-footer { display: flex; justify-content: space-between; padding: 6px 14px; font-size: 10px; color: var(--text-secondary); border-top: 1px solid var(--border); }
        .member-id { font-family: monospace; }
      `}</style>
    </div>
  );
}

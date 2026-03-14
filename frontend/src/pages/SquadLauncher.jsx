import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../services/websocket';

function SquadForm({ onCreated }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [directory, setDirectory] = useState('');
  const [model, setModel] = useState('');
  const [tasks, setTasks] = useState([
    { name: 'Agent 1', task: '' },
    { name: 'Agent 2', task: '' },
  ]);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');

  function addTask() {
    setTasks([...tasks, { name: `Agent ${tasks.length + 1}`, task: '' }]);
  }

  function removeTask(idx) {
    if (tasks.length <= 1) return;
    setTasks(tasks.filter((_, i) => i !== idx));
  }

  function updateTask(idx, field, value) {
    setTasks(tasks.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !goal.trim()) return;
    if (tasks.every((t) => !t.task.trim())) return;
    setLaunching(true);
    setError('');
    try {
      const res = await fetch('/api/squads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          goal: goal.trim(),
          directory: directory.trim() || undefined,
          model: model || undefined,
          tasks: tasks.filter((t) => t.task.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erreur'); setLaunching(false); return; }
      onCreated(data);
      setName('');
      setGoal('');
      setTasks([{ name: 'Agent 1', task: '' }, { name: 'Agent 2', task: '' }]);
    } catch (err) {
      setError(err.message);
    }
    setLaunching(false);
  }

  return (
    <div className="card squad-form-card">
      <h2 style={{ marginBottom: 16, fontSize: 16 }}>Nouvelle mission Squad</h2>
      <form onSubmit={handleSubmit} className="squad-form">
        <div className="squad-form-row">
          <label className="squad-label">
            Nom du squad
            <input className="squad-input" placeholder="Refactor Auth" value={name}
              onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="squad-label">
            Repertoire
            <input className="squad-input" placeholder="C:/Perso/Workspace3/mon-projet" value={directory}
              onChange={(e) => setDirectory(e.target.value)} />
          </label>
          <label className="squad-label" style={{ maxWidth: 160 }}>
            Modele
            <select className="squad-input" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Par defaut</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
              <option value="haiku">Haiku</option>
            </select>
          </label>
        </div>
        <label className="squad-label">
          Objectif global
          <textarea className="squad-input squad-textarea" rows={2}
            placeholder="Decrire la mission globale du squad..."
            value={goal} onChange={(e) => setGoal(e.target.value)} required />
        </label>
        <div className="squad-tasks-header">
          <strong>Sous-taches ({tasks.length})</strong>
          <button type="button" className="squad-add-btn" onClick={addTask}>+ Ajouter</button>
        </div>
        <div className="squad-tasks-list">
          {tasks.map((t, i) => (
            <div key={i} className="squad-task-row">
              <input className="squad-input squad-task-name" placeholder={`Agent ${i + 1}`}
                value={t.name} onChange={(e) => updateTask(i, 'name', e.target.value)} />
              <input className="squad-input" style={{ flex: 1 }} placeholder="Description de la tache..."
                value={t.task} onChange={(e) => updateTask(i, 'task', e.target.value)} />
              <button type="button" className="squad-remove-btn" onClick={() => removeTask(i)}
                disabled={tasks.length <= 1}>✕</button>
            </div>
          ))}
        </div>
        {error && <div className="squad-error">{error}</div>}
        <button type="submit" className="squad-launch-btn" disabled={launching}>
          {launching ? 'Lancement...' : `🚀 Lancer le Squad (${tasks.filter((t) => t.task.trim()).length} agents)`}
        </button>
      </form>
    </div>
  );
}

function SquadCard({ squad, onClick }) {
  const running = squad.members.filter((m) => m.status === 'running').length;
  const done = squad.members.filter((m) => m.status === 'completed' || m.status === 'exited').length;
  const total = squad.members.length;
  const avgProgress = total > 0
    ? Math.round(squad.members.reduce((s, m) => s + (m.progress || 0), 0) / total)
    : 0;

  const statusColors = {
    running: 'var(--accent)',
    completed: 'var(--success, #10b981)',
    partial: 'var(--warning, #f59e0b)',
    cancelled: 'var(--error, #ef4444)',
  };

  return (
    <div className="squad-card" onClick={onClick}>
      <div className="squad-card-header">
        <span className="squad-card-name">{squad.name}</span>
        <span className="squad-card-status" style={{ color: statusColors[squad.status] }}>
          {squad.status}
        </span>
      </div>
      <p className="squad-card-goal">{squad.goal}</p>
      <div className="squad-card-progress">
        <div className="squad-progress-bar">
          <div className="squad-progress-fill" style={{ width: `${avgProgress}%` }} />
        </div>
        <span className="squad-progress-text">{avgProgress}%</span>
      </div>
      <div className="squad-card-meta">
        <span>{done}/{total} termine(s)</span>
        {running > 0 && <span>{running} en cours</span>}
        <span>{new Date(squad.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

export default function SquadLauncher() {
  const navigate = useNavigate();
  const [squads, setSquads] = useState([]);

  const fetchSquads = useCallback(() => {
    fetch('/api/squads').then((r) => r.json()).then(setSquads).catch(console.error);
  }, []);

  useEffect(() => {
    fetchSquads();
    const t = setInterval(fetchSquads, 5000);
    return () => clearInterval(t);
  }, [fetchSquads]);

  useWebSocket(useCallback((event) => {
    if (event.startsWith('squad:')) fetchSquads();
  }, [fetchSquads]));

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Squad Mode</h1>
      <SquadForm onCreated={(squad) => {
        fetchSquads();
        navigate(`/squads/${squad.id}`);
      }} />

      {squads.length > 0 && (
        <>
          <h2 style={{ margin: '24px 0 16px' }}>Squads ({squads.length})</h2>
          <div className="squad-grid">
            {squads.map((s) => (
              <SquadCard key={s.id} squad={s} onClick={() => navigate(`/squads/${s.id}`)} />
            ))}
          </div>
        </>
      )}

      <style>{`
        .squad-form-card { margin-bottom: 24px; }
        .squad-form { display: flex; flex-direction: column; gap: 14px; }
        .squad-form-row { display: flex; gap: 12px; flex-wrap: wrap; }
        .squad-label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); font-weight: 600; flex: 1; min-width: 200px; }
        .squad-input { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 14px; color: var(--text-primary); width: 100%; box-sizing: border-box; }
        .squad-input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
        .squad-textarea { resize: vertical; font-family: inherit; }
        .squad-tasks-header { display: flex; justify-content: space-between; align-items: center; }
        .squad-add-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; font-size: 13px; cursor: pointer; color: var(--accent); }
        .squad-add-btn:hover { background: rgba(139,92,246,0.1); }
        .squad-tasks-list { display: flex; flex-direction: column; gap: 8px; }
        .squad-task-row { display: flex; gap: 8px; align-items: center; }
        .squad-task-name { max-width: 140px; flex: 0 0 140px; }
        .squad-remove-btn { background: none; border: none; color: var(--error, #ef4444); cursor: pointer; font-size: 16px; padding: 4px 8px; }
        .squad-remove-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .squad-error { font-size: 13px; color: var(--error, #ef4444); background: rgba(239,68,68,0.1); padding: 8px 10px; border-radius: 6px; }
        .squad-launch-btn { background: var(--accent); color: white; border: none; border-radius: 8px; padding: 10px 20px; font-size: 15px; font-weight: 600; cursor: pointer; }
        .squad-launch-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .squad-launch-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .squad-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; }
        .squad-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; cursor: pointer; transition: border-color 0.2s; }
        .squad-card:hover { border-color: var(--accent); }
        .squad-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .squad-card-name { font-weight: 600; font-size: 15px; }
        .squad-card-status { font-size: 12px; font-weight: 600; text-transform: uppercase; }
        .squad-card-goal { font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .squad-card-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .squad-progress-bar { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
        .squad-progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
        .squad-progress-text { font-size: 12px; color: var(--text-secondary); font-weight: 600; min-width: 32px; }
        .squad-card-meta { display: flex; gap: 12px; font-size: 11px; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}

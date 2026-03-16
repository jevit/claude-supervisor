import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../services/websocket';

/* ────────────────────────────────────────────────────────────────── */
/*  Panel templates                                                   */
/* ────────────────────────────────────────────────────────────────── */

function TemplatesPanel({ onLoad }) {
  const [templates,    setTemplates]    = useState([]);
  const [open,         setOpen]         = useState(false);
  const [deleting,     setDeleting]     = useState(null);
  const [showVersions, setShowVersions] = useState(null); // templateId avec historique ouvert
  const importRef = React.useRef(null);

  const fetchTemplates = useCallback(() => {
    fetch('/api/squad-templates')
      .then((r) => r.json())
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleDelete = async (id) => {
    setDeleting(id);
    await fetch(`/api/squad-templates/${id}`, { method: 'DELETE' });
    setDeleting(null);
    fetchTemplates();
  };

  // Restaurer une version antérieure (#21)
  const handleRestoreVersion = async (id, versionIndex) => {
    await fetch(`/api/squad-templates/${id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionIndex }),
    });
    fetchTemplates();
    setShowVersions(null);
  };

  // Export tous les templates en JSON (#22)
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `squad-templates-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import templates depuis un fichier JSON (#22)
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const list = Array.isArray(data) ? data : [data];
        for (const tpl of list) {
          if (!tpl.config?.goal || !Array.isArray(tpl.config?.tasks)) continue;
          await fetch('/api/squad-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tpl.name || 'Importé', config: tpl.config }),
          });
        }
        fetchTemplates();
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = ''; // reset pour permettre de réimporter le même fichier
  };

  if (templates.length === 0) return null;

  return (
    <div className="tpl-panel card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="tpl-toggle" onClick={() => setOpen((v) => !v)} style={{ flex: 1 }}>
          <span>📋 Templates enregistrés ({templates.length})</span>
          <span>{open ? '▲' : '▼'}</span>
        </button>
        {/* Export / Import (#22) */}
        <button
          onClick={handleExport}
          title="Exporter tous les templates en JSON"
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
        >📤</button>
        <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        <button
          onClick={() => importRef.current?.click()}
          title="Importer des templates depuis un fichier JSON"
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
        >📥</button>
      </div>

      {open && (
        <div className="tpl-grid">
          {templates.map((t) => (
            <div key={t.id} className="tpl-card">
              <div className="tpl-card-header">
                <span className="tpl-card-name">{t.name}</span>
                <button
                  className="tpl-del-btn"
                  onClick={() => handleDelete(t.id)}
                  disabled={deleting === t.id}
                  title="Supprimer ce template"
                >
                  {deleting === t.id ? '…' : '✕'}
                </button>
              </div>
              <p className="tpl-card-goal">{t.config.goal}</p>
              <div className="tpl-card-meta">
                <span>{t.config.tasks.length} agent{t.config.tasks.length > 1 ? 's' : ''}</span>
                {t.config.model && <span>{t.config.model}</span>}
                {t.config.useWorktrees && <span>worktrees</span>}
              </div>
              <div className="tpl-card-tasks">
                {t.config.tasks.slice(0, 3).map((task, i) => (
                  <span key={i} className="tpl-task-chip">{task.name}</span>
                ))}
                {t.config.tasks.length > 3 && (
                  <span className="tpl-task-chip tpl-task-more">+{t.config.tasks.length - 3}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="tpl-load-btn" style={{ flex: 1 }} onClick={() => { onLoad(t.config); setOpen(false); }}>
                  ↗ Charger
                </button>
                {t.versions && t.versions.length > 0 && (
                  <button
                    onClick={() => setShowVersions(showVersions === t.id ? null : t.id)}
                    title={`${t.versions.length} version(s) antérieure(s)`}
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, color: '#8b5cf6', cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}
                  >
                    🕐 {t.versions.length}
                  </button>
                )}
              </div>
              {/* Historique des versions (#21) */}
              {showVersions === t.id && t.versions && t.versions.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Versions précédentes :</div>
                  {[...t.versions].reverse().map((v, ri) => {
                    const origIdx = t.versions.length - 1 - ri;
                    return (
                      <div key={origIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {new Date(v.savedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {' · '}{v.config?.tasks?.length || 0} agent{(v.config?.tasks?.length || 0) > 1 ? 's' : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => { onLoad(v.config); setOpen(false); }}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 10, padding: '2px 6px' }}
                            title="Charger cette version"
                          >↗</button>
                          <button
                            onClick={() => handleRestoreVersion(t.id, origIdx)}
                            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 4, color: '#8b5cf6', cursor: 'pointer', fontSize: 10, padding: '2px 6px' }}
                            title="Restaurer comme version courante"
                          >↩</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Formulaire de création de squad                                   */
/* ────────────────────────────────────────────────────────────────── */

const BLANK_TASKS = [
  { name: 'Agent 1', task: '', dependsOn: [] },
  { name: 'Agent 2', task: '', dependsOn: [] },
];

function SquadForm({ initialConfig, onCreated, onTemplateRefresh }) {
  const [name,         setName]         = useState('');
  const [goal,         setGoal]         = useState('');
  const [directory,    setDirectory]    = useState('');
  const [model,        setModel]        = useState('');
  const [tasks,        setTasks]        = useState(BLANK_TASKS);
  const [useWorktrees,   setUseWorktrees]   = useState(false);
  const [mode,           setMode]           = useState('oneshot'); // 'oneshot' | 'rolling' (#77)
  const [rollingDelay,   setRollingDelay]   = useState(0); // délai en secondes entre itérations rolling
  const [launching,      setLaunching]      = useState(false);
  const [error,          setError]          = useState('');

  // Nom du template à sauvegarder
  const [tplName,      setTplName]      = useState('');
  const [saving,       setSaving]       = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');

  // Charger un template dans le formulaire
  useEffect(() => {
    if (!initialConfig) return;
    setName(initialConfig.name        || '');
    setGoal(initialConfig.goal        || '');
    setDirectory(initialConfig.directory || '');
    setModel(initialConfig.model      || '');
    setUseWorktrees(initialConfig.useWorktrees ?? false);
    setTasks(
      initialConfig.tasks?.length
        ? initialConfig.tasks.map((t) => ({ name: t.name || '', task: t.task || '', dependsOn: t.dependsOn || [] }))
        : BLANK_TASKS
    );
    setTplName('');
  }, [initialConfig]);

  // Vérifie si ajouter "toIdx dépend de fromIdx" créerait un cycle.
  // Un cycle existe si fromIdx dépend déjà transitivement de toIdx.
  function wouldCreateCycle(fromIdx, toIdx) {
    const visited = new Set();
    const stack = [fromIdx];
    while (stack.length) {
      const cur = stack.pop();
      if (cur === toIdx) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      (tasks[cur]?.dependsOn || []).forEach((depName) => {
        const depIdx = tasks.findIndex((t) => t.name === depName);
        if (depIdx !== -1) stack.push(depIdx);
      });
    }
    return false;
  }

  function addTask() {
    setTasks([...tasks, { name: `Agent ${tasks.length + 1}`, task: '', dependsOn: [] }]);
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
          tasks: tasks.filter((t) => t.task.trim()).map((t) => ({
            name: t.name,
            task: t.task,
            dependsOn: t.dependsOn || [],
          })),
          useWorktrees,
          mode,
          rollingDelayMs: mode === 'rolling' ? rollingDelay * 1000 : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erreur'); setLaunching(false); return; }
      onCreated(data);
      setName('');
      setGoal('');
      setTasks(BLANK_TASKS);
      setMode('oneshot');
      setRollingDelay(0);
    } catch (err) {
      setError(err.message);
    }
    setLaunching(false);
  }

  async function handleSaveTemplate() {
    const templateName = tplName.trim() || name.trim();
    if (!templateName) return;
    setSaving(true);
    try {
      await fetch('/api/squad-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          config: {
            name: name.trim(),
            goal: goal.trim(),
            directory: directory.trim(),
            model,
            useWorktrees,
            tasks: tasks.filter((t) => t.name || t.task).map((t) => ({
              name: t.name,
              task: t.task,
              dependsOn: t.dependsOn || [],
            })),
          },
        }),
      });
      setSaveFeedback(`✓ Template "${templateName}" enregistré`);
      setTplName('');
      onTemplateRefresh?.();
      setTimeout(() => setSaveFeedback(''), 3000);
    } catch {
      setSaveFeedback('Erreur lors de la sauvegarde');
    }
    setSaving(false);
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
            Répertoire
            <input className="squad-input" placeholder="C:/Perso/Workspace3/mon-projet" value={directory}
              onChange={(e) => setDirectory(e.target.value)} />
          </label>
          <label className="squad-label" style={{ maxWidth: 160 }}>
            Modèle
            <select className="squad-input" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">Par défaut</option>
              <option value="claude-sonnet-4-6">Sonnet 4.6</option>
              <option value="claude-opus-4-6">Opus 4.6</option>
              <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
            </select>
          </label>
        </div>
        <label className="squad-label">
          Objectif global
          <textarea className="squad-input squad-textarea" rows={2}
            placeholder="Décrire la mission globale du squad..."
            value={goal} onChange={(e) => setGoal(e.target.value)} required />
        </label>
        <label className="squad-wt-label" title="Chaque agent travaillera sur une branche git isolée (cs-worktrees/)">
          <input type="checkbox" checked={useWorktrees} onChange={(e) => setUseWorktrees(e.target.checked)} />
          <span>Worktrees isolés</span>
          <span className="squad-wt-hint">— branche git par agent dans cs-worktrees/</span>
          <span title="Chaque agent reçoit un répertoire git indépendant, évitant les conflits de fichiers entre agents. Nécessite un repo git." style={{ fontSize: 11, cursor: 'help', opacity: 0.6 }}>ℹ</span>
        </label>
        {/* Mode rolling (#77) */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="squad-label" style={{ flex: '0 0 auto', marginBottom: 0 }}>
            Mode d'exécution
            <span title="One-shot : les agents s'exécutent une seule fois. Rolling : les agents redémarrent automatiquement en boucle après chaque cycle (utile pour le monitoring continu)." style={{ fontSize: 11, cursor: 'help', opacity: 0.6, marginLeft: 4 }}>ℹ</span>
          </label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="squad-input" style={{ width: 'auto', minWidth: 140 }}>
            <option value="oneshot">One-shot (par défaut)</option>
            <option value="rolling">Rolling (boucle continue)</option>
          </select>
          {mode === 'rolling' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              Délai entre itérations :
              <input
                type="number" min={0} max={3600}
                value={rollingDelay} onChange={(e) => setRollingDelay(Number(e.target.value))}
                className="squad-input" style={{ width: 70 }}
              />
              s
            </label>
          )}
        </div>
        <div className="squad-tasks-header">
          <strong>Sous-tâches ({tasks.length})</strong>
          <button type="button" className="squad-add-btn" onClick={addTask}>+ Ajouter</button>
        </div>
        <div className="squad-tasks-list">
          {tasks.map((t, i) => {
            const available = tasks.filter((_, j) => j !== i && tasks[j].name.trim());
            const toggleDep = (depName, depIdx) => {
              const deps = t.dependsOn || [];
              if (deps.includes(depName)) {
                updateTask(i, 'dependsOn', deps.filter((d) => d !== depName));
              } else {
                // Vérifier cycle : si depIdx dépend déjà de i (directement ou indirectement)
                if (wouldCreateCycle(depIdx, i)) return; // silencieusement bloqué — chip reste grisée
                updateTask(i, 'dependsOn', [...deps, depName]);
              }
            };
            return (
              <div key={i} className="squad-task-block">
                <div className="squad-task-row">
                  <input className="squad-input squad-task-name" placeholder={`Agent ${i + 1}`}
                    value={t.name} onChange={(e) => updateTask(i, 'name', e.target.value)} />
                  <input className="squad-input" style={{ flex: 1 }} placeholder="Description de la tâche..."
                    value={t.task} onChange={(e) => updateTask(i, 'task', e.target.value)} />
                  <button type="button" className="squad-remove-btn" onClick={() => removeTask(i)}
                    disabled={tasks.length <= 1}>✕</button>
                </div>
                {available.length > 0 && (
                  <div className="squad-deps-row">
                    <span className="squad-deps-label">Attend :</span>
                    {available.map((a) => {
                      const aIdx = tasks.findIndex((x) => x === a);
                      const active = (t.dependsOn || []).includes(a.name);
                      const isCyclic = !active && wouldCreateCycle(aIdx, i);
                      return (
                        <button key={a.name} type="button"
                          className={`squad-dep-chip ${active ? 'active' : ''} ${isCyclic ? 'cyclic' : ''}`}
                          onClick={() => !isCyclic && toggleDep(a.name, aIdx)}
                          title={isCyclic ? `⛔ Créerait une dépendance circulaire` : active ? `Retirer dépendance sur ${a.name}` : `Attendre que ${a.name} termine`}
                          disabled={isCyclic}
                        >
                          {active ? '⏱ ' : isCyclic ? '⛔ ' : ''}{a.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {error && <div className="squad-error">{error}</div>}

        {/* Actions principales */}
        <button type="submit" className="squad-launch-btn" disabled={launching}>
          {launching ? 'Lancement...' : `🚀 Lancer le Squad (${tasks.filter((t) => t.task.trim()).length} agents)`}
        </button>

        {/* Sauvegarde template */}
        <div className="tpl-save-row">
          <input
            className="squad-input tpl-save-input"
            placeholder={`Nom du template (ex: "${name.trim() || 'Refactor Auth'}")`}
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSaveTemplate())}
          />
          <button
            type="button"
            className="tpl-save-btn"
            onClick={handleSaveTemplate}
            disabled={saving || (!tplName.trim() && !name.trim())}
          >
            {saving ? '…' : '💾 Enregistrer comme template'}
          </button>
          {saveFeedback && <span className="tpl-save-feedback">{saveFeedback}</span>}
        </div>
      </form>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Carte squad existant                                              */
/* ────────────────────────────────────────────────────────────────── */

function SquadCard({ squad, onClick }) {
  const running = squad.members.filter((m) => m.status === 'running').length;
  const done    = squad.members.filter((m) => m.status === 'completed' || m.status === 'exited').length;
  const total   = squad.members.length;
  const avgProgress = total > 0
    ? Math.round(squad.members.reduce((s, m) => s + (m.progress || 0), 0) / total)
    : 0;

  const statusColors = {
    running:   'var(--accent)',
    completed: 'var(--success, #10b981)',
    partial:   'var(--warning, #f59e0b)',
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
        <span>{done}/{total} terminé(s)</span>
        {running > 0 && <span>{running} en cours</span>}
        <span>{new Date(squad.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Page principale                                                   */
/* ────────────────────────────────────────────────────────────────── */

export default function SquadLauncher() {
  const navigate = useNavigate();
  const [squads,        setSquads]        = useState([]);
  const [loadedConfig,  setLoadedConfig]  = useState(null);
  const [tplRefreshKey, setTplRefreshKey] = useState(0);

  const fetchSquads = useCallback(() => {
    fetch('/api/squads').then((r) => r.json()).then(setSquads).catch(console.error);
  }, []);

  useEffect(() => {
    fetchSquads();
    let t = setInterval(fetchSquads, 5000);
    const onVisibility = () => {
      if (document.hidden) { clearInterval(t); t = null; }
      else { clearInterval(t); fetchSquads(); t = setInterval(fetchSquads, 5000); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisibility); };
  }, [fetchSquads]);

  useWebSocket(useCallback((event) => {
    if (event.startsWith('squad:')) fetchSquads();
  }, [fetchSquads]));

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>Squad Mode</h1>

      {/* Templates enregistrés */}
      <TemplatesPanel
        key={tplRefreshKey}
        onLoad={(config) => setLoadedConfig({ ...config, _ts: Date.now() })}
      />

      {/* Formulaire */}
      <SquadForm
        initialConfig={loadedConfig}
        onCreated={(squad) => {
          fetchSquads();
          navigate(`/squads/${squad.id}`);
        }}
        onTemplateRefresh={() => setTplRefreshKey((k) => k + 1)}
      />

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
        /* ── Templates panel ── */
        .tpl-panel { padding: 12px 16px; }
        .tpl-toggle { display: flex; justify-content: space-between; align-items: center; width: 100%; background: none; border: none; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text-primary); padding: 0; }
        .tpl-toggle:hover { color: var(--accent); }
        .tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 12px; }
        .tpl-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
        .tpl-card-header { display: flex; justify-content: space-between; align-items: center; }
        .tpl-card-name { font-weight: 700; font-size: 13px; color: var(--text-primary); }
        .tpl-del-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 12px; padding: 2px 5px; border-radius: 4px; }
        .tpl-del-btn:hover:not(:disabled) { color: var(--error, #ef4444); }
        .tpl-card-goal { font-size: 12px; color: var(--text-secondary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tpl-card-meta { display: flex; gap: 8px; font-size: 10px; color: var(--text-secondary); }
        .tpl-card-tasks { display: flex; flex-wrap: wrap; gap: 4px; }
        .tpl-task-chip { background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2); border-radius: 10px; padding: 1px 7px; font-size: 10px; color: var(--accent); font-weight: 600; }
        .tpl-task-more { background: var(--bg-primary); color: var(--text-secondary); border-color: var(--border); }
        .tpl-load-btn { margin-top: 4px; background: var(--accent); color: white; border: none; border-radius: 6px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; align-self: flex-start; }
        .tpl-load-btn:hover { filter: brightness(1.1); }

        /* ── Save template row ── */
        .tpl-save-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 4px; border-top: 1px solid var(--border); margin-top: 2px; }
        .tpl-save-input { flex: 1; min-width: 180px; font-size: 12px; padding: 6px 10px; }
        .tpl-save-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer; color: var(--text-secondary); white-space: nowrap; }
        .tpl-save-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .tpl-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .tpl-save-feedback { font-size: 12px; color: var(--success, #10b981); font-weight: 600; }

        /* ── Squad form ── */
        .squad-form-card { margin-bottom: 16px; }
        .squad-form { display: flex; flex-direction: column; gap: 14px; }
        .squad-form-row { display: flex; gap: 12px; flex-wrap: wrap; }
        .squad-label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-secondary); font-weight: 600; flex: 1; min-width: 200px; }
        .squad-input { background: rgba(255,255,255,0.05); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 14px; color: var(--text-primary); width: 100%; box-sizing: border-box; }
        .squad-input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
        .squad-textarea { resize: vertical; font-family: inherit; }
        .squad-tasks-header { display: flex; justify-content: space-between; align-items: center; }
        .squad-add-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; font-size: 13px; cursor: pointer; color: var(--accent); }
        .squad-add-btn:hover { background: rgba(139,92,246,0.1); }
        .squad-tasks-list { display: flex; flex-direction: column; gap: 10px; }
        .squad-task-block { display: flex; flex-direction: column; gap: 5px; }
        .squad-task-row { display: flex; gap: 8px; align-items: center; }
        .squad-task-name { max-width: 140px; flex: 0 0 140px; }
        .squad-deps-row { display: flex; align-items: center; gap: 6px; padding-left: 4px; flex-wrap: wrap; }
        .squad-deps-label { font-size: 11px; color: var(--text-secondary); font-weight: 600; white-space: nowrap; }
        .squad-dep-chip { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer; color: var(--text-secondary); transition: all 0.15s; }
        .squad-dep-chip:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .squad-dep-chip.active { background: rgba(139,92,246,0.15); border-color: var(--accent); color: var(--accent); font-weight: 600; }
        .squad-dep-chip.cyclic { border-color: rgba(239,68,68,0.4); color: rgba(239,68,68,0.6); cursor: not-allowed; opacity: 0.6; }
        .squad-remove-btn { background: none; border: none; color: var(--error, #ef4444); cursor: pointer; font-size: 16px; padding: 4px 8px; }
        .squad-remove-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .squad-wt-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .squad-wt-hint { font-size: 11px; color: var(--text-secondary); font-weight: 400; }
        .squad-error { font-size: 13px; color: var(--error, #ef4444); background: rgba(239,68,68,0.1); padding: 8px 10px; border-radius: 6px; }
        .squad-launch-btn { background: var(--accent); color: white; border: none; border-radius: 8px; padding: 10px 20px; font-size: 15px; font-weight: 600; cursor: pointer; }
        .squad-launch-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .squad-launch-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Squads existants ── */
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

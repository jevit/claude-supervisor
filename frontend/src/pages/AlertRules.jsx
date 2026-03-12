import React, { useState, useEffect } from 'react';

const SEVERITY_OPTIONS = ['info', 'warning', 'error'];

export default function AlertRules() {
  const [rules, setRules] = useState({});
  const [newEvent, setNewEvent] = useState('');
  const [newSeverity, setNewSeverity] = useState('info');
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/notifications/rules');
      const data = await res.json();
      setRules(data);
    } catch {}
  };

  useEffect(() => { fetchRules(); }, []);

  const addRule = async (e) => {
    e.preventDefault();
    if (!newEvent.trim()) return;
    try {
      await fetch('/api/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: newEvent.trim(),
          severity: newSeverity,
          titleTemplate: newTitle,
          messageTemplate: newMessage,
        }),
      });
      setNewEvent('');
      setNewTitle('');
      setNewMessage('');
      fetchRules();
    } catch {}
  };

  const deleteRule = async (event) => {
    try {
      await fetch(`/api/notifications/rules/${encodeURIComponent(event)}`, { method: 'DELETE' });
      fetchRules();
    } catch {}
  };

  const ruleEntries = Object.entries(rules);

  return (
    <div>
      <h2>Regles d'Alertes</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 }}>
        Configurez quels evenements generent des notifications. Utilisez <code>{'{key}'}</code> dans les templates pour inserer des donnees dynamiques.
      </p>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Ajouter une regle</h3>
        <form onSubmit={addRule} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
            <input
              placeholder="Evenement (ex: git:conflict)"
              value={newEvent}
              onChange={(e) => setNewEvent(e.target.value)}
              className="form-input"
            />
            <select value={newSeverity} onChange={(e) => setNewSeverity(e.target.value)} className="form-input">
              {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <input
            placeholder="Template titre (ex: Alerte: {name})"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="form-input"
          />
          <input
            placeholder="Template message"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="form-input"
          />
          <button type="submit" className="btn btn-primary" style={{ justifySelf: 'end' }}>Ajouter</button>
        </form>
      </div>

      <h3 style={{ marginBottom: 12 }}>Regles actives ({ruleEntries.length})</h3>
      {ruleEntries.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>Aucune regle</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {ruleEntries.map(([event, rule]) => (
            <div key={event} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <code style={{ fontSize: 13, color: 'var(--accent)' }}>{event}</code>
                  <span className={`severity-badge severity-${rule.severity}`}>{rule.severity}</span>
                  {rule.builtin && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>builtin</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {rule.titleTemplate && <span>Titre: {rule.titleTemplate}</span>}
                </div>
              </div>
              {!rule.builtin && (
                <button onClick={() => deleteRule(event)} className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }}>
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .form-input {
          padding: 8px 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-primary);
          font-size: 13px;
        }
        .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .severity-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
        .severity-info { background: rgba(59,130,246,0.15); color: #3b82f6; }
        .severity-warning { background: rgba(234,179,8,0.15); color: #eab308; }
        .severity-error { background: rgba(239,68,68,0.15); color: #ef4444; }
      `}</style>
    </div>
  );
}

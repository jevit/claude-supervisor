import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

export default function SharedContext() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({ key: '', value: '' });

  const fetchEntries = useCallback(() => {
    fetch('/api/context')
      .then((r) => r.json())
      .then((data) => { setEntries(data); setLoading(false); })
      .catch(console.error);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useWebSocket(useCallback((event) => {
    if (event.startsWith('context:')) fetchEntries();
  }, [fetchEntries]));

  const handleAdd = () => {
    if (!newEntry.key || !newEntry.value) return;
    fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newEntry.key, value: newEntry.value, author: 'dashboard' }),
    })
      .then(() => { setNewEntry({ key: '', value: '' }); setShowAdd(false); fetchEntries(); })
      .catch(console.error);
  };

  const handleDelete = (key) => {
    fetch(`/api/context/${encodeURIComponent(key)}`, { method: 'DELETE' })
      .then(() => fetchEntries())
      .catch(console.error);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Contexte Partage</h1>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Annuler' : 'Ajouter'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
          Informations partagées entre toutes les sessions Claude Code (décisions, conventions, découvertes).
        </p>
        {entries.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, flexShrink: 0,
            background: 'rgba(139,92,246,0.12)', color: 'var(--accent)',
            border: '1px solid rgba(139,92,246,0.2)',
          }}>
            ⚡ Injecté dans les nouveaux terminaux
          </span>
        )}
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="ctx-form">
            <div>
              <label className="form-label">Cle</label>
              <input className="form-input" placeholder="convention-naming" value={newEntry.key}
                onChange={(e) => setNewEntry({ ...newEntry, key: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Valeur</label>
              <textarea className="form-input form-textarea" placeholder="Utiliser camelCase pour les variables JS"
                value={newEntry.value}
                onChange={(e) => setNewEntry({ ...newEntry, value: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={handleAdd}>Ajouter</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement...</span></div>
      ) : entries.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-secondary)' }}>
          Aucun contexte partage. Les sessions peuvent ajouter du contexte via le MCP tool supervisor_set_context.
        </div>
      ) : (
        entries.map((entry) => (
          <div key={entry.key} className="card ctx-entry">
            <div className="ctx-header">
              <span className="ctx-key">{entry.key}</span>
              <button className="btn-small btn-danger" onClick={() => handleDelete(entry.key)}>Supprimer</button>
            </div>
            <p className="ctx-value">{entry.value}</p>
            <div className="ctx-meta">
              <span>Par: {entry.author}</span>
              <span>{new Date(entry.updatedAt).toLocaleString('fr-FR')}</span>
            </div>
          </div>
        ))
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .btn-primary:hover { background: var(--accent-hover); }
        .ctx-form { display: flex; flex-direction: column; gap: 12px; }
        .form-label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .form-input { width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 13px; }
        .form-textarea { min-height: 60px; resize: vertical; font-family: inherit; }
        .ctx-entry { margin-bottom: 12px; }
        .ctx-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .ctx-key { font-family: monospace; font-size: 14px; font-weight: 600; color: var(--accent); }
        .ctx-value { font-size: 14px; color: var(--text-primary); margin-bottom: 8px; white-space: pre-wrap; }
        .ctx-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); }
        .btn-small { background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border); padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
        .btn-danger:hover { color: var(--error); border-color: var(--error); }
      `}</style>
    </div>
  );
}

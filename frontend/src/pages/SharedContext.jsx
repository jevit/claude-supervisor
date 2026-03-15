import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWebSocket } from '../services/websocket';
import { useToast } from '../components/Toast';

/**
 * Historique d'une entrée — versions antérieures avec restauration.
 */
function HistoryPanel({ entryKey, onRestored, addToast }) {
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [restoring, setRestoring] = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null); // index en attente de confirmation

  useEffect(() => {
    fetch(`/api/context/${encodeURIComponent(entryKey)}/history`)
      .then((r) => r.json())
      .then((h) => { setHistory(h); setLoading(false); })
      .catch(() => setLoading(false));
  }, [entryKey]);

  const handleRestore = async (idx) => {
    setConfirmIdx(null);
    setRestoring(idx);
    try {
      await fetch(`/api/context/${encodeURIComponent(entryKey)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionIndex: idx }),
      });
      addToast?.('✓ Version restaurée', 'success');
    } catch {
      addToast?.('Erreur lors de la restauration', 'error');
    }
    setRestoring(null);
    onRestored();
  };

  if (loading) return <div className="history-panel"><span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Chargement...</span></div>;
  if (history.length === 0) return <div className="history-panel"><span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Aucun historique.</span></div>;

  return (
    <div className="history-panel">
      <div className="history-title">Historique ({history.length} version{history.length > 1 ? 's' : ''})</div>
      {[...history].reverse().map((v, i) => {
        const realIdx = history.length - 1 - i;
        return (
          <div key={i} className="history-row">
            <div className="history-meta">
              <span className="history-author">{v.author}</span>
              <span className="history-date">{new Date(v.updatedAt).toLocaleString('fr-FR')}</span>
            </div>
            <p className="history-value">{v.value}</p>
            {confirmIdx === realIdx ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#f59e0b' }}>Confirmer ?</span>
                <button
                  className="history-restore-btn"
                  onClick={() => handleRestore(realIdx)}
                  style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#ef4444' }}
                >Oui</button>
                <button className="history-restore-btn" onClick={() => setConfirmIdx(null)}>Non</button>
              </div>
            ) : (
              <button
                className="history-restore-btn"
                onClick={() => setConfirmIdx(realIdx)}
                disabled={restoring === realIdx}
              >
                {restoring === realIdx ? '...' : '↩ Restaurer'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Carte d'une entrée de contexte.
 */
function ContextEntry({ entry, onDelete, onUpdated, addToast }) {
  const [showHistory, setShowHistory] = useState(false);
  const [editing,     setEditing]     = useState(false);   // mode édition inline (#24)
  const [editValue,   setEditValue]   = useState(entry.value);
  const [saving,      setSaving]      = useState(false);

  // Sync editValue si la valeur distante change et qu'on n'est pas en train d'éditer
  useEffect(() => {
    if (!editing) setEditValue(entry.value);
  }, [entry.value, editing]);

  const handleSave = async () => {
    if (!editValue.trim() || editValue === entry.value) { setEditing(false); return; }
    setSaving(true);
    await fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: entry.key, value: editValue.trim(), author: 'dashboard' }),
    }).catch(() => {});
    setSaving(false);
    setEditing(false);
    onUpdated();
  };

  return (
    <div className="ctx-entry card">
      <div className="ctx-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="ctx-key">{entry.key}</span>
          {(entry.history?.length > 0) && (
            <button
              className="ctx-history-btn"
              onClick={() => setShowHistory((v) => !v)}
              title="Voir l'historique des versions"
            >
              {showHistory ? '▲' : `⟳ ${entry.history.length}`}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!editing && (
            <button className="btn-small" onClick={() => { setEditValue(entry.value); setEditing(true); }} title="Modifier la valeur">✏ Modifier</button>
          )}
          <button className="btn-small btn-danger" onClick={() => onDelete(entry.key)}>Supprimer</button>
        </div>
      </div>
      {editing ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={Math.max(3, editValue.split('\n').length)}
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--accent)', borderRadius: 5, padding: '6px 8px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn-primary btn-small" onClick={handleSave} disabled={saving}>{saving ? '…' : '✓ Enregistrer'}</button>
            <button className="btn-small" onClick={() => setEditing(false)}>Annuler</button>
          </div>
        </div>
      ) : (
        <p className="ctx-value">{entry.value}</p>
      )}
      <div className="ctx-meta">
        <span>Par : {entry.author}</span>
        <span>{new Date(entry.updatedAt).toLocaleString('fr-FR')}</span>
      </div>
      {showHistory && (
        <HistoryPanel entryKey={entry.key} addToast={addToast} onRestored={() => { setShowHistory(false); onUpdated(); }} />
      )}
    </div>
  );
}

export default function SharedContext() {
  const addToast = useToast();
  const [entries, setEntries]       = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [activeNs, setActiveNs]     = useState(null); // null = tous
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [newEntry, setNewEntry]     = useState({ key: '', value: '' });
  const [ctxFilter, setCtxFilter]   = useState(''); // filtre texte clé/valeur
  const [confirmNs, setConfirmNs]   = useState(null); // namespace en attente de confirmation (#43)

  const fetchEntries = useCallback(() => {
    const url = activeNs ? `/api/context?namespace=${encodeURIComponent(activeNs)}` : '/api/context';
    Promise.all([
      fetch(url).then((r) => r.json()),
      fetch('/api/context/namespaces').then((r) => r.json()),
    ]).then(([data, ns]) => {
      setEntries(data);
      setNamespaces(ns);
      setLoading(false);
    }).catch(console.error);
  }, [activeNs]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useWebSocket(useCallback((event) => {
    if (event.startsWith('context:')) fetchEntries();
  }, [fetchEntries]));

  const handleAdd = () => {
    if (!newEntry.key.trim() || !newEntry.value.trim()) return;
    fetch('/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newEntry.key.trim(), value: newEntry.value.trim(), author: 'dashboard' }),
    }).then(() => {
      setNewEntry({ key: '', value: '' });
      setShowAdd(false);
      fetchEntries();
      addToast(`✓ Entrée "${newEntry.key.trim()}" ajoutée`, 'success');
    }).catch(() => addToast('Erreur lors de l\'ajout', 'error'));
  };

  const handleDelete = (key) => {
    fetch(`/api/context/${encodeURIComponent(key)}`, { method: 'DELETE' })
      .then(() => { fetchEntries(); addToast(`✓ Entrée "${key}" supprimée`, 'success'); })
      .catch(() => addToast('Erreur lors de la suppression', 'error'));
  };

  const handleDeleteNamespace = (ns) => {
    setConfirmNs(ns); // affiche la confirmation inline (#43)
  };

  const confirmDeleteNamespace = () => {
    if (!confirmNs) return;
    const ns = confirmNs;
    fetch(`/api/context/namespace/${encodeURIComponent(ns)}`, { method: 'DELETE' })
      .then(() => { setConfirmNs(null); fetchEntries(); addToast(`✓ Namespace "${ns}" supprimé`, 'success'); })
      .catch(() => addToast('Erreur lors de la suppression', 'error'));
  };

  // Filtrer et grouper — recalculé uniquement si entries ou ctxFilter changent
  const { filteredEntries, grouped } = useMemo(() => {
    const filteredEntries = ctxFilter
      ? entries.filter((e) => {
          const q = ctxFilter.toLowerCase();
          return e.key.toLowerCase().includes(q) || String(e.value ?? '').toLowerCase().includes(q);
        })
      : entries;
    const grouped = filteredEntries.reduce((acc, e) => {
      const ns = e.namespace || 'général';
      if (!acc[ns]) acc[ns] = [];
      acc[ns].push(e);
      return acc;
    }, {});
    return { filteredEntries, grouped };
  }, [entries, ctxFilter]);

  const totalCount = namespaces.reduce((s, n) => s + n.count, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Sidebar namespaces */}
      <div className="ns-sidebar">
        <div className="ns-title">Namespaces</div>
        <button
          className={`ns-item ${activeNs === null ? 'active' : ''}`}
          onClick={() => setActiveNs(null)}
        >
          <span>Tous</span>
          <span className="ns-count">{totalCount}</span>
        </button>
        {namespaces.map((n) => (
          <button
            key={n.namespace}
            className={`ns-item ${activeNs === n.namespace ? 'active' : ''}`}
            onClick={() => setActiveNs(n.namespace)}
          >
            <span>{n.namespace}</span>
            <span className="ns-count">{n.count}</span>
          </button>
        ))}
      </div>

      {/* Contenu principal */}
      <div>
        <div className="page-header">
          <div>
            <h1 style={{ margin: 0 }}>Contexte Partagé</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                {activeNs ? `Namespace : ${activeNs}` : 'Toutes les entrées'}
              </p>
              {totalCount > 0 && !activeNs && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: 'rgba(139,92,246,0.12)', color: 'var(--accent)',
                  border: '1px solid rgba(139,92,246,0.2)',
                }}>
                  ⚡ Injecté dans les nouveaux terminaux
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {activeNs && entries.length > 0 && (
              confirmNs === activeNs ? (
                // Confirmation inline (#43) — remplace window.confirm
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <span style={{ fontSize: 12, color: '#ef4444' }}>Supprimer tout le namespace "{activeNs}" ?</span>
                  <button onClick={confirmDeleteNamespace} style={{ background: '#ef4444', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: '3px 10px' }}>Oui</button>
                  <button onClick={() => setConfirmNs(null)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, padding: '3px 10px' }}>Non</button>
                </div>
              ) : (
                <button
                  className="btn-small btn-danger"
                  style={{ padding: '8px 14px', fontSize: 13 }}
                  onClick={() => handleDeleteNamespace(activeNs)}
                >
                  🗑 Vider le namespace
                </button>
              )
            )}
            <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
              {showAdd ? 'Annuler' : '+ Ajouter'}
            </button>
          </div>
        </div>

        {/* Filtre clé/valeur (#23) */}
        {entries.length > 2 && (
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <input
              value={ctxFilter}
              onChange={(e) => setCtxFilter(e.target.value)}
              placeholder="🔍 Filtrer par clé ou valeur…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-primary)', border: `1px solid ${ctxFilter ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6, padding: '6px 28px 6px 10px', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none',
              }}
            />
            {ctxFilter && (
              <button onClick={() => setCtxFilter('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, padding: 0 }}>
                ✕
              </button>
            )}
          </div>
        )}

        {/* Aide namespaces */}
        <div className="ns-hint">
          Utilise <code>/</code> dans la clé pour créer un namespace :
          <code> conventions/commits</code>, <code>stack/node</code>, <code>règles/tests</code>
        </div>

        {/* Formulaire d'ajout */}
        {showAdd && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ctx-form">
              <div>
                <label className="form-label">Clé (namespace/nom ou nom simple)</label>
                <input className="form-input" placeholder="conventions/commits ou stack"
                  value={newEntry.key}
                  onChange={(e) => setNewEntry({ ...newEntry, key: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Valeur</label>
                <textarea className="form-input form-textarea"
                  placeholder="feat:, fix:, chore: — pas d'emojis"
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
          <div className="card" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {activeNs ? `Aucune entrée dans le namespace "${activeNs}".` : 'Aucun contexte partagé.'}
          </div>
        ) : activeNs ? (
          // Vue filtrée : liste plate
          entries.map((entry) => (
            <ContextEntry key={entry.key} entry={entry} onDelete={handleDelete} onUpdated={fetchEntries} addToast={addToast} />
          ))
        ) : (
          // Vue globale : groupée par namespace
          Object.entries(grouped).map(([ns, list]) => (
            <div key={ns} style={{ marginBottom: 20 }}>
              <div className="ns-group-header">
                <span className="ns-group-name" onClick={() => setActiveNs(ns)} style={{ cursor: 'pointer', flex: 1 }}>{ns}</span>
                <span className="ns-group-count">{list.length}</span>
                <button
                  className="ns-clear-btn"
                  onClick={(e) => { e.stopPropagation(); handleDeleteNamespace(ns); }}
                  title={`Supprimer tout le namespace "${ns}"`}
                >
                  🗑 Vider
                </button>
              </div>
              {list.map((entry) => (
                <ContextEntry key={entry.key} entry={entry} onDelete={handleDelete} onUpdated={fetchEntries} addToast={addToast} />
              ))}
            </div>
          ))
        )}
      </div>

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; white-space: nowrap; }
        .ns-sidebar { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 8px; position: sticky; top: 16px; }
        .ns-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 8px 8px; }
        .ns-item { display: flex; justify-content: space-between; align-items: center; width: 100%; background: none; border: none; border-radius: 6px; padding: 6px 10px; font-size: 13px; color: var(--text-secondary); cursor: pointer; text-align: left; }
        .ns-item:hover { background: rgba(139,92,246,0.08); color: var(--text-primary); }
        .ns-item.active { background: rgba(139,92,246,0.15); color: var(--accent); font-weight: 600; }
        .ns-count { font-size: 11px; background: var(--bg-primary); border-radius: 8px; padding: 1px 7px; font-weight: 600; }
        .ns-hint { font-size: 12px; color: var(--text-secondary); background: var(--bg-secondary); border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; }
        .ns-hint code { color: var(--accent); font-family: monospace; background: rgba(139,92,246,0.1); padding: 1px 4px; border-radius: 3px; }
        .ns-group-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .ns-group-header:hover .ns-group-name { color: var(--accent); }
        .ns-clear-btn { background: none; border: 1px solid var(--border); border-radius: 5px; padding: 2px 8px; font-size: 11px; cursor: pointer; color: var(--text-secondary); white-space: nowrap; }
        .ns-clear-btn:hover { border-color: var(--error, #ef4444); color: var(--error, #ef4444); }
        .ns-group-name { font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
        .ns-group-count { font-size: 11px; color: var(--text-secondary); background: var(--bg-secondary); border-radius: 8px; padding: 1px 7px; }
        .ctx-form { display: flex; flex-direction: column; gap: 12px; }
        .form-label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .form-input { width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 13px; box-sizing: border-box; }
        .form-textarea { min-height: 60px; resize: vertical; font-family: inherit; }
        .ctx-entry { margin-bottom: 10px; }
        .ctx-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; }
        .ctx-key { font-family: monospace; font-size: 14px; font-weight: 600; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ctx-history-btn { background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2); border-radius: 4px; padding: 2px 7px; font-size: 11px; color: var(--accent); cursor: pointer; font-weight: 600; white-space: nowrap; }
        .ctx-history-btn:hover { background: rgba(139,92,246,0.2); }
        .ctx-value { font-size: 13px; color: var(--text-primary); margin-bottom: 8px; white-space: pre-wrap; }
        .ctx-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); }
        .btn-small { background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border); padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; white-space: nowrap; }
        .btn-danger:hover { color: var(--error); border-color: var(--error); }
        .history-panel { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
        .history-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .history-row { background: var(--bg-secondary); border-radius: 6px; padding: 8px 10px; }
        .history-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
        .history-author { font-weight: 600; }
        .history-value { font-size: 12px; color: var(--text-primary); margin: 0 0 6px; white-space: pre-wrap; opacity: 0.8; }
        .history-restore-btn { background: none; border: 1px solid var(--border); border-radius: 4px; padding: 2px 9px; font-size: 11px; cursor: pointer; color: var(--text-secondary); }
        .history-restore-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .history-restore-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

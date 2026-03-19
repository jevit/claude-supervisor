import { useState, useEffect, useCallback } from 'react';

/**
 * Navigateur de fichiers inline — permet de parcourir le FS et sélectionner un répertoire.
 * Props :
 *   initialPath  — chemin de départ (optionnel)
 *   onSelect(path) — appelé quand l'utilisateur valide un répertoire
 *   onClose()    — appelé pour fermer le panneau
 */
export default function FileBrowser({ initialPath = '', onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useCallback(async (dir) => {
    setLoading(true);
    setError(null);
    try {
      const url = dir ? `/api/terminals/fs?path=${encodeURIComponent(dir)}` : '/api/terminals/fs';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setCurrentPath(data.path);
      setParent(data.parent);
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Démarrage : naviguer vers initialPath ou racine
  useEffect(() => {
    navigate(initialPath || '');
  }, []);

  // Segments du chemin courant pour le fil d'Ariane
  const breadcrumbs = currentPath
    ? currentPath.replace(/\\/g, '/').split('/').filter(Boolean).reduce((acc, seg, i, arr) => {
        const p = arr.slice(0, i + 1).join('/');
        // Windows : remettre le backslash après la lettre de lecteur
        const fullPath = currentPath.includes('\\')
          ? arr.slice(0, i + 1).join('\\') + (i === 0 ? '\\' : '')
          : '/' + p;
        acc.push({ label: seg, path: fullPath });
        return acc;
      }, [])
    : [];

  const dirs = entries.filter((e) => e.type === 'dir');
  const files = entries.filter((e) => e.type === 'file');

  return (
    <div style={{
      border: '1px solid rgba(139,92,246,0.35)',
      borderRadius: 8,
      background: '#13141f',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: 260,
    }}>
      {/* En-tête */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px',
        borderBottom: '1px solid rgba(45,49,72,0.6)',
        background: 'rgba(139,92,246,0.06)',
        flexShrink: 0,
      }}>
        {/* Bouton retour */}
        <button
          onClick={() => parent !== null ? navigate(parent) : navigate('')}
          disabled={!parent && currentPath === ''}
          title="Répertoire parent"
          style={{
            background: 'none', border: 'none', color: parent !== null ? '#a78bfa' : '#3d4166',
            cursor: parent !== null ? 'pointer' : 'default', fontSize: 13, padding: '0 4px', flexShrink: 0,
          }}
        >
          ←
        </button>

        {/* Fil d'Ariane */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden', flexWrap: 'nowrap' }}>
          <button
            onClick={() => navigate('')}
            style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 10, padding: '0 2px', flexShrink: 0 }}
            title="Racine"
          >
            ⌂
          </button>
          {breadcrumbs.map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
              <span style={{ color: '#3d4166', fontSize: 9, flexShrink: 0 }}>/</span>
              <button
                onClick={() => navigate(b.path)}
                style={{
                  background: 'none', border: 'none', padding: '0 2px',
                  color: i === breadcrumbs.length - 1 ? '#c0caf5' : '#565f89',
                  fontWeight: i === breadcrumbs.length - 1 ? 700 : 400,
                  cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80,
                }}
                title={b.path}
              >
                {b.label}
              </button>
            </span>
          ))}
        </div>

        {/* Bouton fermer */}
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
          title="Fermer"
        >
          ✕
        </button>
      </div>

      {/* Bouton "Sélectionner ce dossier" */}
      {currentPath && (
        <button
          onClick={() => { onSelect(currentPath); onClose(); }}
          style={{
            margin: '6px 10px 0',
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid rgba(139,92,246,0.4)',
            background: 'rgba(139,92,246,0.15)',
            color: '#a78bfa',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title={currentPath}
        >
          ✓ Sélectionner : {currentPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || currentPath}
        </button>
      )}

      {/* Liste des entrées */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {loading && (
          <div style={{ padding: '12px 12px', fontSize: 11, color: '#565f89' }}>Chargement…</div>
        )}
        {error && (
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#ef4444' }}>{error}</div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#565f89' }}>Répertoire vide</div>
        )}
        {!loading && !error && dirs.map((e) => (
          <button
            key={e.path}
            onClick={() => navigate(e.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%',
              background: 'none', border: 'none', padding: '4px 12px',
              color: '#c0caf5', cursor: 'pointer', fontSize: 11,
              textAlign: 'left',
            }}
            onMouseEnter={(ev) => ev.currentTarget.style.background = 'rgba(139,92,246,0.08)'}
            onMouseLeave={(ev) => ev.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: 12, flexShrink: 0 }}>📁</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
          </button>
        ))}
        {!loading && !error && files.map((e) => (
          <div
            key={e.path}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '3px 12px', color: '#4a5070', fontSize: 10,
            }}
          >
            <span style={{ fontSize: 10, flexShrink: 0 }}>📄</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

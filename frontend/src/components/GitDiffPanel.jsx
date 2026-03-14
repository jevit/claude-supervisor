import React, { useState, useEffect, useCallback } from 'react';

/**
 * Panneau de diff Git - affiche les modifications dans un repertoire.
 * Props: { directory, terminalId, onClose }
 */

// Parser un diff unifie en blocs structures
function parseDiff(raw) {
  if (!raw) return [];
  const lines = raw.split('\n');
  const hunks = [];
  let currentHunk = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // En-tete de chunk
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
    if (hunkMatch) {
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'add', content: line.substring(1), oldNum: null, newNum: newLine });
      newLine++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'del', content: line.substring(1), oldNum: oldLine, newNum: null });
      oldLine++;
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" - ignorer
      continue;
    } else {
      currentHunk.lines.push({ type: 'ctx', content: line.substring(1), oldNum: oldLine, newNum: newLine });
      oldLine++;
      newLine++;
    }
  }
  return hunks;
}

// Icone de statut pour un fichier
function statusIcon(status) {
  switch (status) {
    case 'modified': return { letter: 'M', color: '#3b82f6' };
    case 'added': return { letter: 'A', color: '#10b981' };
    case 'deleted': return { letter: 'D', color: '#ef4444' };
    case 'untracked': return { letter: '?', color: '#6b7280' };
    default: return { letter: '?', color: '#6b7280' };
  }
}

export default function GitDiffPanel({ directory, terminalId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (terminalId) {
        res = await fetch(`/api/terminals/${terminalId}/diff`);
      } else if (directory) {
        res = await fetch('/api/git/diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directory }),
        });
      } else {
        setError('Aucun repertoire specifie');
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Erreur inconnue');
        setData(null);
      } else {
        setData(json);
        // Selectionner le premier fichier par defaut
        if (json.files?.length > 0 && !selectedFile) {
          setSelectedFile(json.files[0].path);
        }
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [terminalId, directory]);

  useEffect(() => { fetchDiff(); }, [fetchDiff]);

  // Fichier actuellement selectionne
  const currentFile = data?.files?.find(f => f.path === selectedFile);
  const hunks = currentFile ? parseDiff(currentFile.diff) : [];

  return (
    <div className="gdp-root">
      {/* En-tete */}
      <div className="gdp-header">
        <div className="gdp-header-left">
          <span className="gdp-title">Git Diff</span>
          <span className="gdp-directory" title={directory}>{directory || '...'}</span>
        </div>
        <div className="gdp-header-right">
          <button className="gdp-btn gdp-btn-refresh" onClick={fetchDiff} title="Rafraichir">
            ↻
          </button>
          {onClose && (
            <button className="gdp-btn gdp-btn-close" onClick={onClose} title="Fermer">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Contenu */}
      {loading && (
        <div className="gdp-center">
          <span className="gdp-loading-spinner" />
          <span>Chargement du diff...</span>
        </div>
      )}

      {error && (
        <div className="gdp-center gdp-error-state">
          <span className="gdp-error-icon">!</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && data && data.files?.length === 0 && (
        <div className="gdp-center gdp-clean-state">
          <span className="gdp-clean-icon">✓</span>
          <span>Aucun changement - repertoire propre</span>
        </div>
      )}

      {!loading && !error && data && data.files?.length > 0 && (
        <>
          {/* Barre de resume */}
          <div className="gdp-summary">
            {data.summary.modified > 0 && (
              <span className="gdp-badge gdp-badge-modified">{data.summary.modified} modifie(s)</span>
            )}
            {data.summary.added > 0 && (
              <span className="gdp-badge gdp-badge-added">{data.summary.added} ajoute(s)</span>
            )}
            {data.summary.deleted > 0 && (
              <span className="gdp-badge gdp-badge-deleted">{data.summary.deleted} supprime(s)</span>
            )}
            {data.summary.untracked > 0 && (
              <span className="gdp-badge gdp-badge-untracked">{data.summary.untracked} non-suivi(s)</span>
            )}
            <span className="gdp-file-count">{data.files.length} fichier(s)</span>
          </div>

          {/* Panneau principal : liste + diff */}
          <div className="gdp-main">
            {/* Liste des fichiers */}
            <div className="gdp-file-list">
              {data.files.map(f => {
                const icon = statusIcon(f.status);
                const isActive = selectedFile === f.path;
                return (
                  <div
                    key={f.path}
                    className={`gdp-file-item ${isActive ? 'gdp-file-active' : ''}`}
                    onClick={() => setSelectedFile(f.path)}
                    title={f.path}
                  >
                    <span className="gdp-file-status" style={{ color: icon.color, background: icon.color + '20' }}>
                      {icon.letter}
                    </span>
                    <span className="gdp-file-name">{f.path.split('/').pop()}</span>
                    <span className="gdp-file-path">{f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : ''}</span>
                  </div>
                );
              })}
            </div>

            {/* Vue du diff */}
            <div className="gdp-diff-view">
              {!selectedFile && (
                <div className="gdp-center" style={{ color: '#565f89' }}>
                  Selectionnez un fichier
                </div>
              )}
              {selectedFile && hunks.length === 0 && (
                <div className="gdp-center" style={{ color: '#565f89' }}>
                  Pas de diff disponible pour ce fichier
                </div>
              )}
              {selectedFile && hunks.length > 0 && (
                <div className="gdp-diff-content">
                  <div className="gdp-diff-file-header">{selectedFile}</div>
                  {hunks.map((hunk, hi) => (
                    <div key={hi} className="gdp-hunk">
                      <div className="gdp-hunk-header">{hunk.header}</div>
                      {hunk.lines.map((line, li) => (
                        <div key={li} className={`gdp-diff-line gdp-line-${line.type}`}>
                          <span className="gdp-line-num gdp-line-num-old">
                            {line.oldNum ?? ''}
                          </span>
                          <span className="gdp-line-num gdp-line-num-new">
                            {line.newNum ?? ''}
                          </span>
                          <span className="gdp-line-sign">
                            {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                          </span>
                          <span className="gdp-line-content">{line.content}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        .gdp-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1b26;
          color: #c0caf5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        /* En-tete */
        .gdp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #1a1b26;
          border-bottom: 1px solid var(--border, #2d3148);
          flex-shrink: 0;
        }
        .gdp-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
        }
        .gdp-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--accent, #8b5cf6);
          flex-shrink: 0;
        }
        .gdp-directory {
          font-size: 12px;
          color: #565f89;
          font-family: monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gdp-header-right {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .gdp-btn {
          background: none;
          border: 1px solid var(--border, #2d3148);
          border-radius: 4px;
          padding: 2px 8px;
          cursor: pointer;
          color: #c0caf5;
          font-size: 14px;
          transition: background 0.15s;
        }
        .gdp-btn:hover { background: rgba(255,255,255,0.08); }
        .gdp-btn-refresh { font-size: 16px; }
        .gdp-btn-close { color: #ef4444; }

        /* Etats centraux */
        .gdp-center {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex: 1;
          padding: 32px;
          color: #565f89;
          font-size: 14px;
        }
        .gdp-loading-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(139,92,246,0.3);
          border-top-color: var(--accent, #8b5cf6);
          border-radius: 50%;
          animation: gdp-spin 0.8s linear infinite;
        }
        @keyframes gdp-spin { to { transform: rotate(360deg); } }
        .gdp-error-state { color: #ef4444; }
        .gdp-error-icon {
          width: 24px; height: 24px;
          border-radius: 50%;
          background: rgba(239,68,68,0.15);
          color: #ef4444;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 14px;
        }
        .gdp-clean-state { color: #10b981; }
        .gdp-clean-icon {
          width: 24px; height: 24px;
          border-radius: 50%;
          background: rgba(16,185,129,0.15);
          color: #10b981;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 14px;
        }

        /* Barre de resume */
        .gdp-summary {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid var(--border, #2d3148);
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .gdp-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
        }
        .gdp-badge-modified { background: rgba(59,130,246,0.15); color: #3b82f6; }
        .gdp-badge-added { background: rgba(16,185,129,0.15); color: #10b981; }
        .gdp-badge-deleted { background: rgba(239,68,68,0.15); color: #ef4444; }
        .gdp-badge-untracked { background: rgba(107,114,128,0.15); color: #6b7280; }
        .gdp-file-count {
          margin-left: auto;
          font-size: 11px;
          color: #565f89;
        }

        /* Panneau principal */
        .gdp-main {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        /* Liste des fichiers */
        .gdp-file-list {
          width: 240px;
          min-width: 200px;
          border-right: 1px solid var(--border, #2d3148);
          overflow-y: auto;
          flex-shrink: 0;
        }
        .gdp-file-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          cursor: pointer;
          border-bottom: 1px solid rgba(45,49,72,0.5);
          transition: background 0.1s;
          overflow: hidden;
        }
        .gdp-file-item:hover { background: rgba(255,255,255,0.04); }
        .gdp-file-active { background: rgba(139,92,246,0.1) !important; border-left: 2px solid var(--accent, #8b5cf6); }
        .gdp-file-status {
          flex-shrink: 0;
          width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 700;
          font-family: monospace;
        }
        .gdp-file-name {
          font-size: 12px;
          color: #c0caf5;
          font-family: monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gdp-file-path {
          font-size: 10px;
          color: #565f89;
          font-family: monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-left: auto;
        }

        /* Vue du diff */
        .gdp-diff-view {
          flex: 1;
          overflow: auto;
          min-width: 0;
        }
        .gdp-diff-content {
          font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
        }
        .gdp-diff-file-header {
          padding: 6px 12px;
          background: rgba(139,92,246,0.08);
          color: var(--accent, #8b5cf6);
          font-weight: 600;
          font-size: 12px;
          font-family: monospace;
          position: sticky;
          top: 0;
          z-index: 1;
          border-bottom: 1px solid var(--border, #2d3148);
        }
        .gdp-hunk { margin-bottom: 2px; }
        .gdp-hunk-header {
          padding: 4px 12px;
          background: rgba(139,92,246,0.06);
          color: var(--accent, #8b5cf6);
          font-size: 11px;
          font-family: monospace;
          border-top: 1px solid rgba(45,49,72,0.5);
          border-bottom: 1px solid rgba(45,49,72,0.3);
          user-select: none;
        }

        /* Lignes de diff */
        .gdp-diff-line {
          display: flex;
          white-space: pre;
          min-height: 18px;
        }
        .gdp-line-num {
          display: inline-block;
          width: 44px;
          text-align: right;
          padding-right: 8px;
          color: #565f89;
          font-size: 11px;
          user-select: none;
          flex-shrink: 0;
        }
        .gdp-line-sign {
          display: inline-block;
          width: 14px;
          text-align: center;
          flex-shrink: 0;
          user-select: none;
        }
        .gdp-line-content {
          flex: 1;
          overflow-x: auto;
          padding-right: 12px;
        }

        /* Couleurs des lignes */
        .gdp-line-add {
          background: rgba(16,185,129,0.08);
          color: #4ade80;
        }
        .gdp-line-add .gdp-line-sign { color: #10b981; }
        .gdp-line-add .gdp-line-num { color: #10b981; opacity: 0.6; }

        .gdp-line-del {
          background: rgba(239,68,68,0.08);
          color: #f87171;
        }
        .gdp-line-del .gdp-line-sign { color: #ef4444; }
        .gdp-line-del .gdp-line-num { color: #ef4444; opacity: 0.6; }

        .gdp-line-ctx {
          color: #9ca3af;
        }

        /* Scrollbar personnalisee */
        .gdp-file-list::-webkit-scrollbar,
        .gdp-diff-view::-webkit-scrollbar {
          width: 6px;
        }
        .gdp-file-list::-webkit-scrollbar-track,
        .gdp-diff-view::-webkit-scrollbar-track {
          background: transparent;
        }
        .gdp-file-list::-webkit-scrollbar-thumb,
        .gdp-diff-view::-webkit-scrollbar-thumb {
          background: rgba(139,92,246,0.3);
          border-radius: 3px;
        }
        .gdp-file-list::-webkit-scrollbar-thumb:hover,
        .gdp-diff-view::-webkit-scrollbar-thumb:hover {
          background: rgba(139,92,246,0.5);
        }
      `}</style>
    </div>
  );
}

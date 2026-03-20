import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Panneau de diff Git — unified ou side-by-side, liste ou arbre de fichiers.
 * Props: { directory, terminalId, onClose }
 */

/* ── Parsers ─────────────────────────────────────────────────────── */

export function parseDiff(raw) {
  if (!raw) return [];
  const lines = raw.split('\n');
  const hunks = [];
  let currentHunk = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of lines) {
    const m = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
    if (m) {
      currentHunk = { header: line, lines: [] };
      hunks.push(currentHunk);
      oldLine = parseInt(m[1], 10);
      newLine = parseInt(m[2], 10);
      continue;
    }
    if (!currentHunk) continue;
    if (line.startsWith('+')) {
      currentHunk.lines.push({ type: 'add', content: line.substring(1), oldNum: null, newNum: newLine++ });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({ type: 'del', content: line.substring(1), oldNum: oldLine++, newNum: null });
    } else if (!line.startsWith('\\')) {
      currentHunk.lines.push({ type: 'ctx', content: line.substring(1), oldNum: oldLine++, newNum: newLine++ });
    }
  }
  return hunks;
}

// Convertit des hunks en lignes côte-à-côte { left, right }
export function buildSideBySide(hunks) {
  const rows = [];
  for (const hunk of hunks) {
    rows.push({ isHeader: true, header: hunk.header });
    const lines = hunk.lines;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.type === 'ctx') {
        rows.push({
          left:  { num: line.oldNum, content: line.content, type: 'ctx' },
          right: { num: line.newNum, content: line.content, type: 'ctx' },
        });
        i++;
      } else if (line.type === 'del' || line.type === 'add') {
        // Ramasser tous les del consécutifs puis les add consécutifs
        const dels = [];
        while (i < lines.length && lines[i].type === 'del') { dels.push(lines[i]); i++; }
        const adds = [];
        while (i < lines.length && lines[i].type === 'add') { adds.push(lines[i]); i++; }
        const len = Math.max(dels.length, adds.length);
        for (let j = 0; j < len; j++) {
          rows.push({
            left:  dels[j] ? { num: dels[j].oldNum, content: dels[j].content, type: 'del' }
                           : { num: '', content: '', type: 'empty' },
            right: adds[j] ? { num: adds[j].newNum, content: adds[j].content, type: 'add' }
                           : { num: '', content: '', type: 'empty' },
          });
        }
      } else {
        i++;
      }
    }
  }
  return rows;
}

// Construit un arbre { dirs: {name: node}, files: [file] } depuis une liste plate
export function buildFileTree(files) {
  const root = { dirs: {}, files: [] };
  for (const f of files) {
    const parts = f.path.replace(/\\/g, '/').split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!node.dirs[p]) node.dirs[p] = { dirs: {}, files: [] };
      node = node.dirs[p];
    }
    node.files.push(f);
  }
  return root;
}

/* ── Couleur de statut ───────────────────────────────────────────── */
export function fileColor(f) {
  if (f.status === 'untracked') return '#6b7280';
  if (f.status === 'deleted')   return '#ef4444';
  if (f.status === 'added')     return '#10b981';
  if (f.staged && !f.unstaged) return '#10b981'; // entièrement stagé → vert
  if (f.unstaged)               return '#f59e0b'; // non-stagé → orange
  return '#3b82f6';
}
export function fileStatusLetter(f) {
  if (f.status === 'untracked') return '?';
  if (f.status === 'deleted')   return 'D';
  if (f.status === 'added')     return 'A';
  if (f.staged && !f.unstaged) return 'S';
  return 'M';
}

/* ── Composant arbre de fichiers ─────────────────────────────────── */
function FileTreeNode({ name, node, selectedFile, onSelect, depth = 0, fileActionProps }) {
  // La racine (name=null) est toujours ouverte ; les sous-dossiers démarrent fermés
  const [open, setOpen] = useState(!name);
  const hasFiles = node.files.length > 0;
  const indent   = depth * 12;

  return (
    <div>
      {name && (
        <div
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: `4px 10px 4px ${10 + indent}px`,
            cursor: 'pointer', userSelect: 'none',
            borderBottom: '1px solid rgba(45,49,72,0.3)',
            color: '#565f89', fontSize: 11,
          }}
        >
          <span style={{ fontSize: 9, opacity: 0.7 }}>{open ? '▼' : '▶'}</span>
          <span style={{ fontFamily: 'monospace' }}>📁 {name}</span>
        </div>
      )}
      {open && (
        <>
          {Object.entries(node.dirs).map(([dirName, child]) => (
            <FileTreeNode
              key={dirName}
              name={dirName}
              node={child}
              selectedFile={selectedFile}
              onSelect={onSelect}
              depth={depth + (name ? 1 : 0)}
              fileActionProps={fileActionProps}
            />
          ))}
          {hasFiles && node.files.map((f) => {
            const color  = fileColor(f);
            const letter = fileStatusLetter(f);
            const isActive = selectedFile === f.path;
            const fileName = f.path.replace(/\\/g, '/').split('/').pop();
            return (
              <div
                key={f.path}
                onClick={() => onSelect(f.path)}
                title={f.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: `5px 10px 5px ${10 + indent + (name ? 12 : 0)}px`,
                  cursor: 'pointer', borderBottom: '1px solid rgba(45,49,72,0.4)',
                  background: isActive ? 'rgba(139,92,246,0.1)' : 'transparent',
                  borderLeft: isActive ? '2px solid #8b5cf6' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 3,
                  background: color + '22', color, fontSize: 10,
                  fontWeight: 700, fontFamily: 'monospace',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{letter}</span>
                <span style={{
                  fontSize: 11, fontFamily: 'monospace', color: '#c0caf5',
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{fileName}</span>
                {fileActionProps?.onOpenFile && (
                  <button
                    onClick={(e) => { e.stopPropagation(); fileActionProps.onOpenFile(f.absPath || f.path); }}
                    title="Voir dans l'explorateur de fichiers"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#565f89', fontSize: 11, padding: '1px 4px', flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#a78bfa'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#565f89'; }}
                  >↗</button>
                )}
                {fileActionProps && (
                  <FileActions file={f} {...fileActionProps} />
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ── Diff d'un commit spécifique ─────────────────────────────────── */
function CommitDiff({ hash, directory }) {
  const [diff, setDiff]       = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!hash || !directory) return;
    fetch('/api/git/diff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory, commitHash: hash }),
    })
      .then((r) => r.json())
      .then((d) => { setDiff(d.commitDiff || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, [hash, directory]);

  if (loading) return <div style={{ padding: 16, color: '#565f89', fontSize: 12 }}>Chargement…</div>;
  if (!diff)   return <div style={{ padding: 16, color: '#565f89', fontSize: 12 }}>Pas de diff disponible</div>;
  return (
    <pre style={{ margin: 0, padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#c0caf5', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
      {diff.split('\n').map((line, i) => (
        <span key={i} style={{
          display: 'block',
          color: line.startsWith('+') && !line.startsWith('+++') ? '#4ade80'
               : line.startsWith('-') && !line.startsWith('---') ? '#f87171'
               : line.startsWith('@@') ? '#8b5cf6'
               : line.startsWith('diff ') || line.startsWith('index ') ? '#565f89'
               : '#c0caf5',
          background: line.startsWith('+') && !line.startsWith('+++') ? 'rgba(16,185,129,0.06)'
                    : line.startsWith('-') && !line.startsWith('---') ? 'rgba(239,68,68,0.06)'
                    : 'transparent',
        }}>{line || ' '}</span>
      ))}
    </pre>
  );
}

/* ── Constantes ──────────────────────────────────────────────────── */
const TOOL_ICON = { Write: '✎', Edit: '✏', MultiEdit: '✏✏', NotebookEdit: '📓' };
function normPath(p) { return (p || '').replace(/\\/g, '/').toLowerCase(); }

/* ── Boutons d'action Git ────────────────────────────────────────── */
function FileActions({ file, directory, onDone, onError, confirmDiscard, onConfirmDiscard }) {
  const [busy, setBusy] = useState(false);

  const run = async (action, extra = {}) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/git/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, filePath: file.path, ...extra }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        onError?.(j.error || `Erreur git ${action}`);
      } else {
        onDone();
      }
    } catch (e) { onError?.(e.message); }
    setBusy(false);
  };

  const s = { background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700, opacity: busy ? 0.5 : 1, transition: 'background 0.1s' };
  const isDiscarding = confirmDiscard === file.path;

  return (
    <span style={{ display: 'flex', gap: 2, flexShrink: 0, marginLeft: 4 }} onClick={(e) => e.stopPropagation()}>
      {/* Stage si non-stagé ou untracked */}
      {(file.unstaged || file.status === 'untracked') && (
        <button style={{ ...s, color: '#10b981' }} title="Stager ce fichier" disabled={busy}
          onClick={() => run('stage')}>+</button>
      )}
      {/* Unstage si stagé */}
      {file.staged && (
        <button style={{ ...s, color: '#f59e0b' }} title="Unstager ce fichier" disabled={busy}
          onClick={() => run('unstage')}>−</button>
      )}
      {/* Discard — two-step */}
      {file.status !== 'deleted' && (
        isDiscarding
          ? <button style={{ ...s, color: '#fff', background: '#ef4444', padding: '1px 6px' }} disabled={busy}
              onClick={() => run('discard', { untracked: file.status === 'untracked' })}>
              Confirmer
            </button>
          : <button style={{ ...s, color: '#ef4444' }} title="Annuler les modifications" disabled={busy}
              onClick={() => onConfirmDiscard(file.path)}>
              ✕
            </button>
      )}
    </span>
  );
}

/* ── Composant principal ─────────────────────────────────────────── */
export default function GitDiffPanel({ directory, terminalId, onClose, onOpenFile, refreshKey }) {
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [data, setData]           = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [activity, setActivity]       = useState([]);
  const [showActivity, setShowActivity] = useState(() => localStorage.getItem('diff:activity') === 'true');
  const [viewMode, setViewMode]       = useState(() => localStorage.getItem('diff:view')   || 'unified'); // 'unified' | 'split'
  const [fileView, setFileView]       = useState(() => localStorage.getItem('diff:layout') || 'tree');    // 'list' | 'tree'
  const [mainTab, setMainTab]         = useState('diff'); // 'diff' | 'log'
  const [gitLog, setGitLog]           = useState(null);
  const [logLoading, setLogLoading]   = useState(false);
  const [commitMsg, setCommitMsg]     = useState('');
  const [committing, setCommitting]   = useState(false);
  const [commitResult, setCommitResult] = useState(null); // 'ok' | 'error'
  const [pushing, setPushing]         = useState(false);
  const [pushResult, setPushResult]   = useState(null);   // 'ok' | 'error'
  const [stageAllBusy, setStageAllBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(null); // filepath en attente
  const [opError, setOpError]           = useState(null);   // erreur git operation
  const [resolvedDir, setResolvedDir]   = useState(directory); // répertoire résolu (peut venir du terminal)
  const [fileDiff, setFileDiff]         = useState('');        // diff lazy-loadé pour le fichier sélectionné
  const [diffLoading, setDiffLoading]   = useState(false);

  const showOpError = (msg) => {
    setOpError(msg);
    setTimeout(() => setOpError(null), 4000);
  };
  const refreshTimerRef               = useRef(null);

  // Réinitialiser la confirmation de discard sur clic ailleurs
  const handleRootClick = useCallback(() => setConfirmDiscard(null), []);

  const fetchDiff = useCallback(async (nocache = false) => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (terminalId) {
        res = await fetch(`/api/terminals/${terminalId}/diff`);
        if (!res.ok && directory) {
          res = await fetch('/api/git/diff', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory, nocache }),
          });
        }
      } else if (directory) {
        res = await fetch('/api/git/diff', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directory, nocache }),
        });
      } else {
        setError('Aucun répertoire spécifié');
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Erreur inconnue');
        setData(null);
      } else {
        setData(json);
        if (json.directory) setResolvedDir(json.directory);
        if (json.files?.length > 0 && !selectedFile) setSelectedFile(json.files[0].path);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [terminalId, directory]);

  const gitOp = useCallback(async (action, body = {}) => {
    if (!resolvedDir) { showOpError('Répertoire non résolu — réouvrez le panneau'); return false; }
    try {
      const res = await fetch(`/api/git/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: resolvedDir, ...body }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg;
        try { msg = JSON.parse(text).error; } catch {}
        showOpError(msg || text.slice(0, 120) || `Erreur HTTP ${res.status} (git ${action})`);
        return false;
      }
    } catch (e) { showOpError(e.message || 'Erreur réseau'); return false; }
    await fetchDiff();
    return true;
  }, [resolvedDir, fetchDiff]);

  const handleStageAll = async () => {
    setStageAllBusy(true);
    await gitOp('stage-all');
    setStageAllBusy(false);
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    try {
      // Si aucun fichier stagé, on stage tout d'abord
      if (!hasStagedFiles) {
        const ok = await gitOp('stage-all');
        if (!ok) { setCommitting(false); return; }
      }
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: resolvedDir, message: commitMsg.trim() }),
      });
      if (res.ok) {
        setCommitResult('ok');
        setCommitMsg('');
      } else {
        const j = await res.json().catch(() => ({}));
        showOpError(j.error || 'Erreur lors du commit');
        setCommitResult('error');
      }
      setTimeout(() => setCommitResult(null), 3000);
      fetchDiff();
    } catch (e) { showOpError(e.message); setCommitResult('error'); }
    setCommitting(false);
  };

  const fetchLog = useCallback(async () => {
    if (!resolvedDir) return;
    setLogLoading(true);
    try {
      const res = await fetch(`/api/git/log?directory=${encodeURIComponent(resolvedDir)}`);
      if (res.ok) setGitLog(await res.json());
    } catch {}
    setLogLoading(false);
  }, [resolvedDir]);

  useEffect(() => { fetchDiff(); }, [fetchDiff]);
  // Re-fetch (sans cache) quand l'onglet diff est activé depuis Terminals
  useEffect(() => { if (refreshKey) fetchDiff(true); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Réinitialiser la sélection de fichier lors d'un changement de terminal/répertoire
  useEffect(() => { setSelectedFile(null); setFileDiff(''); }, [terminalId, directory]);

  // Lazy-load du diff du fichier sélectionné
  useEffect(() => {
    if (!selectedFile || selectedFile.startsWith('__commit__') || !resolvedDir) {
      setFileDiff('');
      return;
    }
    const currentFile = data?.files?.find((f) => f.path === selectedFile);
    if (!currentFile) return;
    let cancelled = false;
    setDiffLoading(true);
    setFileDiff('');
    fetch('/api/git/file-diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: resolvedDir, filePath: selectedFile, status: currentFile.status }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setFileDiff(d.diff || ''); })
      .catch(() => { if (!cancelled) setFileDiff(''); })
      .finally(() => { if (!cancelled) setDiffLoading(false); });
    return () => { cancelled = true; };
  }, [selectedFile, resolvedDir, data]);

  // Ecouter file:activity pour auto-refresh + feed live
  useEffect(() => {
    const dir = normPath(directory);
    const handler = (e) => {
      const { event, data: evData } = e.detail || {};
      if (event !== 'file:activity') return;
      const evDir = normPath(evData?.directory);
      if (!dir || !evDir || (!evDir.startsWith(dir) && !dir.startsWith(evDir))) return;
      setActivity((prev) => [{
        id: Date.now() + Math.random(),
        tool: evData.tool, filePath: evData.filePath,
        ts: evData.timestamp || new Date().toISOString(),
      }, ...prev].slice(0, 30));
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => { refreshTimerRef.current = null; fetchDiff(); }, 2000);
    };
    window.addEventListener('ws:message', handler);
    return () => { window.removeEventListener('ws:message', handler); if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, [directory, fetchDiff]);

  const isCommitRef  = selectedFile?.startsWith('__commit__');
  const hunks        = parseDiff(fileDiff);
  const sbsRows      = viewMode === 'split' ? buildSideBySide(hunks) : [];
  const fileTree     = data?.files ? buildFileTree(data.files) : null;

  /* ── Légende des couleurs (tree) ── */
  const legend = (
    <div style={{ display: 'flex', gap: 8, padding: '4px 10px', borderBottom: '1px solid rgba(45,49,72,0.4)', flexWrap: 'wrap' }}>
      {[['S', '#10b981', 'Stagé'], ['M', '#f59e0b', 'Modifié'], ['D', '#ef4444', 'Supprimé'], ['?', '#6b7280', 'Non-suivi']].map(([l, c, label]) => (
        <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#565f89' }}>
          <span style={{ width: 14, height: 14, borderRadius: 2, background: c + '22', color: c, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>{l}</span>
          {label}
        </span>
      ))}
    </div>
  );

  const hasStagedFiles   = data?.files?.some((f) => f.staged) ?? false;
  const hasUnstagedFiles = data?.files?.some((f) => f.unstaged || f.status === 'untracked') ?? false;

  return (
    <div className="gdp-root" onClick={handleRootClick}>
      {/* En-tête */}
      <div className="gdp-header">
        <div className="gdp-header-left">
          <span className="gdp-title">⎇ Git Diff</span>
          <span className="gdp-directory" title={directory}>
            {directory ? directory.split(/[/\\]/).slice(-2).join('/') : '…'}
          </span>
          {data?.currentBranch && (
            <span style={{ fontSize: 11, background: 'rgba(139,92,246,0.25)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 4, padding: '1px 7px', fontWeight: 700 }}>
              {data.currentBranch}
            </span>
          )}
        </div>
        <div className="gdp-header-right">
          {/* Onglet Diff / Log (#82) */}
          <div className="gdp-toggle-group">
            <button className={`gdp-toggle ${mainTab === 'diff' ? 'gdp-toggle-active' : ''}`} onClick={() => setMainTab('diff')} title="Diff working tree">⎇ Diff</button>
            <button className={`gdp-toggle ${mainTab === 'log'  ? 'gdp-toggle-active' : ''}`} onClick={() => { setMainTab('log'); if (!gitLog) fetchLog(); }} title="Historique des commits">📜 Log</button>
          </div>
          {/* Toggle mode diff */}
          {mainTab === 'diff' && <div className="gdp-toggle-group">
            <button className={`gdp-toggle ${viewMode === 'unified' ? 'gdp-toggle-active' : ''}`} onClick={() => { setViewMode('unified'); localStorage.setItem('diff:view', 'unified'); }} title="Vue unifiée">≡</button>
            <button className={`gdp-toggle ${viewMode === 'split'   ? 'gdp-toggle-active' : ''}`} onClick={() => { setViewMode('split');   localStorage.setItem('diff:view', 'split');   }} title="Vue côte à côte">⊞</button>
          </div>}
          {/* Toggle vue fichiers */}
          <div className="gdp-toggle-group">
            <button className={`gdp-toggle ${fileView === 'list' ? 'gdp-toggle-active' : ''}`} onClick={() => { setFileView('list'); localStorage.setItem('diff:layout', 'list'); }} title="Liste plate">☰</button>
            <button className={`gdp-toggle ${fileView === 'tree' ? 'gdp-toggle-active' : ''}`} onClick={() => { setFileView('tree'); localStorage.setItem('diff:layout', 'tree'); }} title="Arbre">⊢</button>
          </div>
          <button className="gdp-btn gdp-btn-refresh" onClick={fetchDiff} title="Rafraîchir" disabled={loading}>
            {loading ? '⟳' : '↻'}
          </button>
          {onClose && (
            <button className="gdp-btn gdp-btn-close" onClick={onClose} title="Retour au terminal">&gt;_ Retour</button>
          )}
        </div>
      </div>

      {/* États de chargement / erreur */}
      {loading && (
        <div className="gdp-center"><span className="gdp-loading-spinner" /><span>Chargement du diff...</span></div>
      )}
      {error && (
        <div className="gdp-center gdp-error-state">
          <span className="gdp-error-icon">!</span><span>{error}</span>
        </div>
      )}

      {/* Vue Log (#82) */}
      {mainTab === 'log' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #2d3148', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#565f89', fontWeight: 600 }}>20 derniers commits</span>
            <button onClick={fetchLog} disabled={logLoading} style={{ background: 'none', border: '1px solid #2d3148', borderRadius: 4, color: '#a9b1d6', cursor: 'pointer', fontSize: 12, padding: '2px 8px' }}>
              {logLoading ? '⟳' : '↻'}
            </button>
          </div>
          {logLoading && <div className="gdp-center"><span className="gdp-loading-spinner" /><span>Chargement…</span></div>}
          {!logLoading && gitLog && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {gitLog.map((c) => (
                <div key={c.hash}
                  onClick={() => { setSelectedFile(`__commit__${c.hash}`); setMainTab('diff'); }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', borderBottom: '1px solid rgba(45,49,72,0.4)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ fontSize: 10, color: '#8b5cf6', fontFamily: 'monospace', flexShrink: 0 }}>{c.short}</code>
                    <span style={{ fontSize: 12, color: '#c0caf5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#565f89' }}>
                    <span>{c.author}</span>
                    <span>{c.date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!logLoading && !gitLog && (
            <div className="gdp-center" style={{ flexDirection: 'column', gap: 6 }}>
              <span style={{ opacity: 0.4 }}>📜</span>
              <span>Cliquez sur ↻ pour charger l'historique</span>
            </div>
          )}
        </div>
      )}

      {mainTab === 'diff' && !loading && !error && data && (
        <>
          {/* Résumé */}
          <div className="gdp-summary">
            {data.currentBranch && <span className="gdp-badge" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>⎇ {data.currentBranch}</span>}
            {data.files?.length === 0 ? (
              <span className="gdp-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>✓ Working tree propre</span>
            ) : (
              <>
                {data.summary?.modified  > 0 && <span className="gdp-badge gdp-badge-modified">{data.summary.modified} modifié(s)</span>}
                {data.summary?.added     > 0 && <span className="gdp-badge gdp-badge-added">{data.summary.added} ajouté(s)</span>}
                {data.summary?.deleted   > 0 && <span className="gdp-badge gdp-badge-deleted">{data.summary.deleted} supprimé(s)</span>}
                {data.summary?.untracked > 0 && <span className="gdp-badge gdp-badge-untracked">{data.summary.untracked} non-suivi(s)</span>}
                <span className="gdp-file-count">{data.files.length} fichier(s)</span>
              </>
            )}
          </div>

          {/* Panneau principal */}
          <div className="gdp-main">
            {/* Colonne gauche : liste + commit panel */}
            <div className="gdp-left-col">
            <div className="gdp-file-list">
              {/* Feed activité live — toggle persisté */}
              <div className="gdp-list-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1 }}>Activité live {activity.length > 0 && <span style={{ color: '#565f89' }}>({activity.length})</span>}</span>
                <button
                  onClick={() => setShowActivity((v) => { const next = !v; localStorage.setItem('diff:activity', next); return next; })}
                  title={showActivity ? 'Masquer' : 'Afficher'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: showActivity ? '#10b981' : '#3d4166', padding: '0 2px' }}
                >
                  {showActivity ? '●' : '○'}
                </button>
              </div>
              {showActivity && activity.length > 0 && activity.map((a) => {
                const fileName = a.filePath ? a.filePath.split(/[/\\]/).pop() : '…';
                const age = Math.round((Date.now() - new Date(a.ts).getTime()) / 1000);
                return (
                  <div key={a.id} className="gdp-activity-item">
                    <span className="gdp-activity-tool">{TOOL_ICON[a.tool] || '?'}</span>
                    <span className="gdp-activity-file" title={a.filePath}>{fileName}</span>
                    <span className="gdp-activity-age">{age < 60 ? `${age}s` : `${Math.round(age / 60)}m`}</span>
                  </div>
                );
              })}
              {showActivity && activity.length === 0 && (
                <div style={{ padding: '4px 10px', fontSize: 10, color: '#3d4166', fontStyle: 'italic' }}>En attente d'activité…</div>
              )}

              {/* Fichiers modifiés — liste ou arbre */}
              {data.files?.length > 0 && (
                <>
                  <div className="gdp-list-section-title">Fichiers modifiés</div>
                  {fileView === 'tree' && (
                    <>
                      {legend}
                      <FileTreeNode
                        name={null}
                        node={fileTree}
                        selectedFile={selectedFile}
                        onSelect={setSelectedFile}
                        depth={0}
                        fileActionProps={{ directory: resolvedDir, onDone: fetchDiff, onError: showOpError, confirmDiscard, onConfirmDiscard: setConfirmDiscard, onOpenFile }}
                      />
                    </>
                  )}
                  {fileView === 'list' && data.files.map((f) => {
                    const color  = fileColor(f);
                    const letter = fileStatusLetter(f);
                    const isActive = selectedFile === f.path;
                    return (
                      <div
                        key={f.path}
                        className={`gdp-file-item ${isActive ? 'gdp-file-active' : ''}`}
                        onClick={() => setSelectedFile(f.path)}
                        title={f.path}
                      >
                        <span className="gdp-file-status" style={{ color, background: color + '20' }}>{letter}</span>
                        <span className="gdp-file-name" style={{ flex: 1 }}>{f.path.split(/[/\\]/).pop()}</span>
                        {onOpenFile && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenFile(f.absPath || f.path); }}
                            title="Voir dans l'explorateur de fichiers"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#565f89', fontSize: 11, padding: '1px 4px', flexShrink: 0 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#a78bfa'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#565f89'; }}
                          >↗</button>
                        )}
                        <FileActions file={f} directory={resolvedDir} onDone={fetchDiff} onError={showOpError}
                          confirmDiscard={confirmDiscard} onConfirmDiscard={setConfirmDiscard} />
                      </div>
                    );
                  })}
                </>
              )}

              {/* Commits récents */}
              {data.recentCommits?.length > 0 && (
                <>
                  <div className="gdp-list-section-title" style={{ marginTop: data.files?.length > 0 ? 8 : 0 }}>
                    Historique ({data.recentCommits.length})
                  </div>
                  {data.recentCommits.map((c) => (
                    <div
                      key={c.hash}
                      className={`gdp-commit-item ${selectedFile === `__commit__${c.hash}` ? 'gdp-file-active' : ''}`}
                      onClick={() => setSelectedFile(`__commit__${c.hash}`)}
                      title={c.message}
                    >
                      <code className="gdp-commit-hash">{c.hash}</code>
                      <span className="gdp-commit-msg">{c.message}</span>
                    </div>
                  ))}
                </>
              )}

              {data.files?.length === 0 && !data.recentCommits?.length && (
                <div className="gdp-center" style={{ padding: 24, fontSize: 12 }}>Aucun historique</div>
              )}
            </div>{/* fin gdp-file-list */}

            {/* Panneau commit — collé en bas de la colonne gauche */}
            {data.files?.length > 0 && (
              <div className="gdp-commit-panel" onClick={(e) => e.stopPropagation()}>
                {/* Compteurs stagé / non-stagé */}
                <div style={{ display: 'flex', gap: 6, fontSize: 10 }}>
                  {hasStagedFiles && (
                    <span style={{ color: '#10b981', background: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: '1px 7px', fontWeight: 600 }}>
                      ✓ {data.files.filter((f) => f.staged).length} stagé{data.files.filter((f) => f.staged).length > 1 ? 's' : ''}
                    </span>
                  )}
                  {hasUnstagedFiles && (
                    <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: '1px 7px', fontWeight: 600 }}>
                      ● {data.files.filter((f) => f.unstaged || f.status === 'untracked').length} non-stagé{data.files.filter((f) => f.unstaged || f.status === 'untracked').length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {/* Erreur opération git */}
                {opError && (
                  <div style={{ fontSize: 10, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, padding: '4px 8px', wordBreak: 'break-word' }}>
                    ✗ {opError}
                  </div>
                )}
                {/* Stage All (raccourci explicite si rien n'est stagé) */}
                {hasUnstagedFiles && hasStagedFiles && (
                  <button type="button" className="gdp-commit-action-btn" disabled={stageAllBusy} onClick={handleStageAll}
                    style={{ width: '100%', background: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                    {stageAllBusy ? '…' : '+ Stage all'}
                  </button>
                )}
                {/* Message de commit — toujours actif */}
                <input
                  className="gdp-commit-input"
                  placeholder="Message de commit…"
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit(); } }}
                />
                {/* Ligne commit + push */}
                <div style={{ display: 'flex', gap: 5 }}>
                  {/* Bouton commit — adaptatif selon l'état de staging */}
                  <button
                    type="button"
                    className="gdp-commit-action-btn"
                    disabled={!commitMsg.trim() || committing}
                    onClick={handleCommit}
                    title={!hasStagedFiles ? 'Stagera automatiquement tous les fichiers avant de commiter' : undefined}
                    style={{
                      flex: 1,
                      background: commitMsg.trim() ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                      color: commitMsg.trim() ? '#8b5cf6' : '#565f89',
                      border: `1px solid ${commitMsg.trim() ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
                    }}>
                    {committing ? '…'
                      : commitResult === 'ok' ? '✓ Commité'
                      : commitResult === 'error' ? '✗ Erreur'
                      : hasStagedFiles ? '⎇ Commit'
                      : '⎇ Stage & Commit'}
                  </button>
                  {/* Bouton push */}
                  <button
                    type="button"
                    className="gdp-commit-action-btn"
                    disabled={pushing}
                    onClick={async () => {
                      setPushing(true);
                      try {
                        const res = await fetch('/api/git/push', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ directory: resolvedDir }),
                        });
                        if (res.ok) { setPushResult('ok'); }
                        else { const j = await res.json().catch(() => ({})); showOpError(j.error || 'Erreur push'); setPushResult('error'); }
                      } catch (e) { showOpError(e.message); setPushResult('error'); }
                      setTimeout(() => setPushResult(null), 3000);
                      setPushing(false);
                    }}
                    title="git push"
                    style={{
                      flexShrink: 0,
                      background: 'rgba(56,189,248,0.1)',
                      color: pushResult === 'ok' ? '#10b981' : pushResult === 'error' ? '#ef4444' : '#38bdf8',
                      border: '1px solid rgba(56,189,248,0.3)',
                    }}>
                    {pushing ? '…' : pushResult === 'ok' ? '✓' : pushResult === 'error' ? '✗' : '↑ Push'}
                  </button>
                </div>
              </div>
            )}
            </div>{/* fin gdp-left-col */}

            {/* Vue du diff */}
            <div className="gdp-diff-view">
              {!selectedFile && (
                <div className="gdp-center" style={{ color: '#565f89', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 24, opacity: 0.3 }}>⎇</span>
                  <span>Sélectionnez un fichier ou un commit</span>
                </div>
              )}

              {/* Chargement diff fichier */}
              {selectedFile && !isCommitRef && diffLoading && (
                <div className="gdp-center"><span className="gdp-loading-spinner" /><span>Chargement du diff…</span></div>
              )}

              {/* Diff unifié */}
              {selectedFile && !isCommitRef && !diffLoading && viewMode === 'unified' && (
                hunks.length === 0
                  ? <div className="gdp-center" style={{ color: '#565f89' }}>Pas de diff pour ce fichier</div>
                  : <div className="gdp-diff-content">
                      <div className="gdp-diff-file-header">{selectedFile}</div>
                      {hunks.map((hunk, hi) => (
                        <div key={hi} className="gdp-hunk">
                          <div className="gdp-hunk-header">{hunk.header}</div>
                          {hunk.lines.map((line, li) => (
                            <div key={li} className={`gdp-diff-line gdp-line-${line.type}`}>
                              <span className="gdp-line-num">{line.oldNum ?? ''}</span>
                              <span className="gdp-line-num">{line.newNum ?? ''}</span>
                              <span className="gdp-line-sign">{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</span>
                              <span className="gdp-line-content">{line.content}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
              )}

              {/* Diff côte à côte */}
              {selectedFile && !isCommitRef && !diffLoading && viewMode === 'split' && (
                sbsRows.length === 0
                  ? <div className="gdp-center" style={{ color: '#565f89' }}>Pas de diff pour ce fichier</div>
                  : <div className="gdp-sbs-root">
                      <div className="gdp-sbs-header">
                        <div className="gdp-sbs-col-header">Avant</div>
                        <div className="gdp-sbs-col-header">Après</div>
                      </div>
                      <div className="gdp-sbs-body">
                        {sbsRows.map((row, i) =>
                          row.isHeader ? (
                            <div key={i} className="gdp-sbs-hunk-header">{row.header}</div>
                          ) : (
                            <div key={i} className="gdp-sbs-row">
                              {/* Côté gauche (ancien) */}
                              <div className={`gdp-sbs-cell gdp-sbs-${row.left.type}`}>
                                <span className="gdp-sbs-num">{row.left.num ?? ''}</span>
                                <span className="gdp-sbs-line">{row.left.content}</span>
                              </div>
                              {/* Côté droit (nouveau) */}
                              <div className={`gdp-sbs-cell gdp-sbs-${row.right.type}`}>
                                <span className="gdp-sbs-num">{row.right.num ?? ''}</span>
                                <span className="gdp-sbs-line">{row.right.content}</span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
              )}

              {/* Diff commit */}
              {isCommitRef && (() => {
                const hash   = selectedFile.replace('__commit__', '');
                const commit = data.recentCommits?.find((c) => c.hash === hash);
                return (
                  <div className="gdp-diff-content">
                    <div className="gdp-diff-file-header" style={{ display: 'flex', gap: 10 }}>
                      <code style={{ color: '#8b5cf6' }}>{hash}</code>
                      <span>{commit?.message}</span>
                    </div>
                    <CommitDiff hash={hash} directory={resolvedDir} />
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}
      {mainTab === 'diff' && !loading && !error && !data && null}

      <style>{`
        .gdp-root {
          display: flex; flex-direction: column; height: 100%;
          background: #1a1b26; color: #c0caf5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        /* En-tête */
        .gdp-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 12px;
          background: rgba(139,92,246,0.12);
          border-bottom: 2px solid rgba(139,92,246,0.4);
          flex-shrink: 0; gap: 8px;
        }
        .gdp-header-left  { display: flex; align-items: center; gap: 10px; overflow: hidden; flex: 1; min-width: 0; }
        .gdp-header-right { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        .gdp-title    { font-size: 13px; font-weight: 700; color: #8b5cf6; flex-shrink: 0; }
        .gdp-directory { font-size: 12px; color: #565f89; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Boutons toggle (unified/split, list/tree) */
        .gdp-toggle-group { display: flex; border: 1px solid #2d3148; border-radius: 5px; overflow: hidden; }
        .gdp-toggle {
          background: none; border: none; border-right: 1px solid #2d3148;
          padding: 3px 8px; cursor: pointer; color: #565f89; font-size: 13px;
          transition: background 0.15s, color 0.15s;
        }
        .gdp-toggle:last-child { border-right: none; }
        .gdp-toggle:hover { background: rgba(255,255,255,0.06); color: #c0caf5; }
        .gdp-toggle-active { background: rgba(139,92,246,0.2) !important; color: #8b5cf6 !important; }

        .gdp-btn {
          background: none; border: 1px solid #2d3148; border-radius: 4px;
          padding: 2px 8px; cursor: pointer; color: #c0caf5; font-size: 14px;
          transition: background 0.15s;
        }
        .gdp-btn:hover { background: rgba(255,255,255,0.08); }
        .gdp-btn-refresh { font-size: 16px; }
        .gdp-btn-close { color: #ef4444; font-size: 11px; }

        /* États centraux */
        .gdp-center { display: flex; align-items: center; justify-content: center; gap: 10px; flex: 1; padding: 32px; color: #565f89; font-size: 14px; }
        .gdp-loading-spinner { width: 18px; height: 18px; border: 2px solid rgba(139,92,246,0.3); border-top-color: #8b5cf6; border-radius: 50%; animation: gdp-spin 0.8s linear infinite; }
        @keyframes gdp-spin { to { transform: rotate(360deg); } }
        .gdp-error-state { color: #ef4444; }
        .gdp-error-icon { width: 24px; height: 24px; border-radius: 50%; background: rgba(239,68,68,0.15); color: #ef4444; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }

        /* Résumé */
        .gdp-summary { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(255,255,255,0.02); border-bottom: 1px solid #2d3148; flex-shrink: 0; flex-wrap: wrap; }
        .gdp-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
        .gdp-badge-modified  { background: rgba(245,158,11,0.15);  color: #f59e0b; }
        .gdp-badge-added     { background: rgba(16,185,129,0.15);   color: #10b981; }
        .gdp-badge-deleted   { background: rgba(239,68,68,0.15);    color: #ef4444; }
        .gdp-badge-untracked { background: rgba(107,114,128,0.15);  color: #6b7280; }
        .gdp-file-count { margin-left: auto; font-size: 11px; color: #565f89; }

        /* Panneau principal */
        .gdp-main { display: flex; flex: 1; min-height: 0; overflow: hidden; }

        /* Colonne gauche : wrapper + liste scrollable + commit panel */
        .gdp-left-col { display: flex; flex-direction: column; width: 220px; min-width: 180px; border-right: 1px solid #2d3148; flex-shrink: 0; min-height: 0; }
        .gdp-file-list { flex: 1; overflow-y: auto; min-height: 0; }

        /* Panneau commit */
        .gdp-commit-panel { flex-shrink: 0; display: flex; flex-direction: column; gap: 5px; padding: 8px; border-top: 1px solid rgba(139,92,246,0.25); background: rgba(139,92,246,0.04); }
        .gdp-commit-input { background: #1a1b26; border: 1px solid #2d3148; border-radius: 5px; color: #c0caf5; font-size: 11px; padding: 5px 8px; font-family: monospace; outline: none; width: 100%; box-sizing: border-box; }
        .gdp-commit-input:focus { border-color: rgba(139,92,246,0.5); }
        .gdp-commit-input:disabled { opacity: 0.4; cursor: not-allowed; }
        .gdp-commit-action-btn { border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; text-align: center; transition: opacity 0.15s; }
        .gdp-commit-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .gdp-list-section-title { padding: 6px 10px 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #565f89; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(45,49,72,0.5); }
        .gdp-file-item { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; border-bottom: 1px solid rgba(45,49,72,0.5); transition: background 0.1s; overflow: hidden; }
        .gdp-file-item:hover { background: rgba(255,255,255,0.04); }
        .gdp-file-active { background: rgba(139,92,246,0.1) !important; border-left: 2px solid #8b5cf6; }
        .gdp-file-status { flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 3px; font-size: 10px; font-weight: 700; font-family: monospace; }
        .gdp-file-name { font-size: 11px; color: #c0caf5; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gdp-commit-item { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; cursor: pointer; border-bottom: 1px solid rgba(45,49,72,0.5); transition: background 0.1s; overflow: hidden; }
        .gdp-commit-item:hover { background: rgba(255,255,255,0.04); }
        .gdp-commit-hash { font-size: 10px; color: #8b5cf6; font-family: monospace; }
        .gdp-commit-msg  { font-size: 11px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Activité live */
        .gdp-activity-item { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-bottom: 1px solid rgba(45,49,72,0.4); font-size: 11px; animation: gdp-fadein 0.3s ease; }
        @keyframes gdp-fadein { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        @keyframes gdp-pulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .gdp-activity-tool { flex-shrink: 0; font-size: 12px; color: #f59e0b; }
        .gdp-activity-file { flex: 1; color: #c0caf5; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .gdp-activity-age  { flex-shrink: 0; color: #565f89; font-size: 10px; }

        /* Vue du diff — commune */
        .gdp-diff-view { flex: 1; overflow: auto; min-width: 0; }
        .gdp-diff-content { font-family: 'Cascadia Code','Fira Code',Consolas,monospace; font-size: 12px; line-height: 1.5; }
        .gdp-diff-file-header { padding: 6px 12px; background: rgba(139,92,246,0.08); color: #8b5cf6; font-weight: 600; font-size: 12px; font-family: monospace; position: sticky; top: 0; z-index: 1; border-bottom: 1px solid #2d3148; }
        .gdp-hunk { margin-bottom: 2px; }
        .gdp-hunk-header { padding: 4px 12px; background: rgba(139,92,246,0.06); color: #8b5cf6; font-size: 11px; font-family: monospace; border-top: 1px solid rgba(45,49,72,0.5); border-bottom: 1px solid rgba(45,49,72,0.3); user-select: none; }
        .gdp-diff-line { display: flex; white-space: pre; min-height: 18px; }
        .gdp-line-num  { display: inline-block; width: 44px; text-align: right; padding-right: 8px; color: #565f89; font-size: 11px; user-select: none; flex-shrink: 0; }
        .gdp-line-sign { display: inline-block; width: 14px; text-align: center; flex-shrink: 0; user-select: none; }
        .gdp-line-content { flex: 1; padding-right: 12px; }
        .gdp-line-add { background: rgba(16,185,129,0.08); color: #4ade80; }
        .gdp-line-add .gdp-line-sign { color: #10b981; }
        .gdp-line-add .gdp-line-num  { color: #10b981; opacity: 0.6; }
        .gdp-line-del { background: rgba(239,68,68,0.08); color: #f87171; }
        .gdp-line-del .gdp-line-sign { color: #ef4444; }
        .gdp-line-del .gdp-line-num  { color: #ef4444; opacity: 0.6; }
        .gdp-line-ctx { color: #9ca3af; }

        /* Vue côte à côte */
        .gdp-sbs-root  { display: flex; flex-direction: column; font-family: 'Cascadia Code','Fira Code',Consolas,monospace; font-size: 12px; line-height: 1.5; }
        .gdp-sbs-header { display: flex; flex-shrink: 0; border-bottom: 1px solid #2d3148; position: sticky; top: 0; z-index: 1; background: #1a1b26; }
        .gdp-sbs-col-header { flex: 1; padding: 4px 10px; font-size: 11px; font-weight: 700; color: #565f89; background: rgba(255,255,255,0.02); text-align: center; }
        .gdp-sbs-col-header:first-child { border-right: 1px solid #2d3148; }
        .gdp-sbs-body { flex: 1; }
        .gdp-sbs-hunk-header { padding: 3px 12px; background: rgba(139,92,246,0.06); color: #8b5cf6; font-size: 11px; border-top: 1px solid rgba(45,49,72,0.5); border-bottom: 1px solid rgba(45,49,72,0.3); user-select: none; }
        .gdp-sbs-row  { display: flex; min-height: 18px; border-bottom: 1px solid rgba(45,49,72,0.2); }
        .gdp-sbs-cell { display: flex; flex: 1; min-width: 0; white-space: pre; overflow: hidden; }
        .gdp-sbs-cell:first-child { border-right: 1px solid rgba(45,49,72,0.6); }
        .gdp-sbs-num  { display: inline-block; width: 40px; text-align: right; padding-right: 6px; color: #565f89; font-size: 11px; user-select: none; flex-shrink: 0; }
        .gdp-sbs-line { flex: 1; padding-right: 8px; overflow: hidden; }
        .gdp-sbs-del   { background: rgba(239,68,68,0.1);  color: #f87171; }
        .gdp-sbs-del .gdp-sbs-num { color: #ef4444; opacity: 0.6; }
        .gdp-sbs-add   { background: rgba(16,185,129,0.1); color: #4ade80; }
        .gdp-sbs-add .gdp-sbs-num { color: #10b981; opacity: 0.6; }
        .gdp-sbs-ctx   { color: #9ca3af; }
        .gdp-sbs-empty { background: rgba(255,255,255,0.01); }

        /* Scrollbars */
        .gdp-file-list::-webkit-scrollbar, .gdp-diff-view::-webkit-scrollbar { width: 6px; height: 6px; }
        .gdp-file-list::-webkit-scrollbar-track, .gdp-diff-view::-webkit-scrollbar-track { background: transparent; }
        .gdp-file-list::-webkit-scrollbar-thumb, .gdp-diff-view::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 3px; }
      `}</style>
    </div>
  );
}

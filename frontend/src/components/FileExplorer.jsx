import { useState, useEffect, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

/* ── Détection du langage à partir de l'extension ─────────────────── */
const EXT_LANG = {
  js: 'js', jsx: 'js', ts: 'js', tsx: 'js', mjs: 'js', cjs: 'js',
  json: 'json', jsonc: 'json',
  md: 'md', mdx: 'md',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html',
  sh: 'sh', bash: 'sh', zsh: 'sh',
  py: 'py', rb: 'rb', go: 'go', rs: 'rs', java: 'java', cs: 'cs',
  env: 'env', toml: 'env', yaml: 'env', yml: 'env', ini: 'env',
};

function extOf(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function langOf(name) {
  return EXT_LANG[extOf(name)] || 'text';
}

/* ── Icône fichier selon l'extension ─────────────────────────────── */
function fileIcon(name) {
  const ext = extOf(name);
  if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext)) return '🟨';
  if (['json', 'jsonc'].includes(ext)) return '📋';
  if (['md', 'mdx'].includes(ext)) return '📝';
  if (['css', 'scss', 'less'].includes(ext)) return '🎨';
  if (['html', 'htm', 'xml'].includes(ext)) return '🌐';
  if (['sh', 'bash', 'zsh'].includes(ext)) return '⚙';
  if (['py'].includes(ext)) return '🐍';
  if (['env', 'toml', 'yaml', 'yml', 'ini'].includes(ext)) return '🔧';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼';
  return '📄';
}

// Normalise un chemin en forward slashes lowercase pour comparaisons
function normPath(p) { return (p || '').replace(/\\/g, '/').toLowerCase(); }

/* ── Nœud de l'arbre ──────────────────────────────────────────────── */
function TreeNode({ entry, depth, selectedPath, onSelect, jumpToFile }) {
  const [open, setOpen] = useState(depth === 0);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);
  const indent = depth * 14;

  const loadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/terminals/fs?path=${encodeURIComponent(entry.path)}`);
      const data = await res.json();
      setChildren(data.entries || []);
    } catch {
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, [entry.path]);

  // Auto-expand si le fichier cible est dans ce dossier
  useEffect(() => {
    if (!jumpToFile || entry.type !== 'dir') return;
    const target = normPath(jumpToFile);
    const self   = normPath(entry.path);
    if (target.startsWith(self + '/')) {
      setOpen(true);
      if (children === null) loadChildren();
    }
  }, [jumpToFile, entry.path, entry.type, children, loadChildren]);

  const toggle = async () => {
    if (entry.type !== 'dir') {
      onSelect(entry);
      return;
    }
    const next = !open;
    setOpen(next);
    if (next && children === null) await loadChildren();
  };

  const isSelected = selectedPath === entry.path;
  const isDir = entry.type === 'dir';

  return (
    <div>
      <div
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: `3px 10px 3px ${10 + indent}px`,
          cursor: 'pointer', userSelect: 'none',
          background: isSelected ? 'rgba(139,92,246,0.18)' : 'none',
          borderLeft: isSelected ? '2px solid #8b5cf6' : '2px solid transparent',
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'none'; }}
      >
        {isDir ? (
          <span style={{ fontSize: 9, color: '#565f89', width: 10, flexShrink: 0 }}>
            {loading ? '…' : open ? '▾' : '▸'}
          </span>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12, flexShrink: 0 }}>
          {isDir ? (open ? '📂' : '📁') : fileIcon(entry.name)}
        </span>
        <span style={{
          fontSize: 12, color: isDir ? '#c0caf5' : '#a0a8c0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: isSelected ? 600 : 400,
        }}>
          {entry.name}
        </span>
      </div>
      {isDir && open && children && children.map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          jumpToFile={jumpToFile}
        />
      ))}
    </div>
  );
}

/* ── Visionneur de contenu ────────────────────────────────────────── */
function FileViewer({ filePath }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mdRendered, setMdRendered] = useState(true); // mode rendu par défaut pour .md

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setContent(null);
    setError(null);
    fetch(`/api/terminals/fs/read?path=${encodeURIComponent(filePath)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filePath]);

  // Remettre le mode rendu à chaque changement de fichier
  useEffect(() => { setMdRendered(true); }, [filePath]);

  const copy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const fileName = filePath ? filePath.replace(/\\/g, '/').split('/').pop() : '';
  const isMd = ['md', 'mdx'].includes(extOf(fileName));
  const renderedHtml = useMemo(() => {
    if (!isMd || !content) return '';
    try { return DOMPurify.sanitize(marked.parse(content)); } catch { return ''; }
  }, [content, isMd]);

  if (!filePath) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3d4166', fontSize: 12 }}>
      Sélectionne un fichier
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      {/* En-tête fichier */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderBottom: '1px solid rgba(45,49,72,0.6)',
        background: 'rgba(255,255,255,0.02)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13 }}>{fileIcon(fileName)}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#c0caf5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {fileName}
        </span>
        {/* Toggle source / rendu (MD uniquement) */}
        {isMd && content && (
          <div style={{ display: 'flex', border: '1px solid rgba(45,49,72,0.8)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
            {[{ id: true, label: '👁 Rendu' }, { id: false, label: '</> Source' }].map((v) => (
              <button
                key={String(v.id)}
                onClick={() => setMdRendered(v.id)}
                style={{
                  background: mdRendered === v.id ? 'rgba(139,92,246,0.2)' : 'none',
                  color: mdRendered === v.id ? '#a78bfa' : '#565f89',
                  border: 'none', padding: '2px 8px', cursor: 'pointer', fontSize: 10,
                  fontWeight: mdRendered === v.id ? 700 : 400,
                  borderRight: v.id === true ? '1px solid rgba(45,49,72,0.8)' : 'none',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
        <span style={{ fontSize: 10, color: '#565f89', flexShrink: 0, fontFamily: 'monospace' }}>
          {langOf(fileName).toUpperCase()}
        </span>
        {content && (
          <button
            onClick={copy}
            title="Copier le contenu"
            style={{
              background: 'none', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 4,
              color: copied ? '#4ade80' : '#a78bfa', cursor: 'pointer', fontSize: 10,
              padding: '2px 7px', flexShrink: 0,
            }}
          >
            {copied ? '✓ Copié' : 'Copier'}
          </button>
        )}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {loading && (
          <div style={{ padding: 16, fontSize: 11, color: '#565f89' }}>Chargement…</div>
        )}
        {error && (
          <div style={{ padding: 16, fontSize: 11, color: '#ef4444' }}>{error}</div>
        )}

        {/* Rendu Markdown */}
        {content !== null && !loading && isMd && mdRendered && (
          <div
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
            style={{
              padding: '16px 20px',
              color: '#c0caf5',
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
            className="md-preview"
          />
        )}

        {/* Source avec numéros de ligne */}
        {content !== null && !loading && (!isMd || !mdRendered) && (
          <pre style={{
            margin: 0, padding: '10px 0',
            fontSize: 11, lineHeight: 1.6,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: '#a0a8c0',
            whiteSpace: 'pre',
            overflowX: 'auto',
          }}>
            {content.split('\n').map((line, i) => (
              <div key={i} style={{ display: 'flex', minHeight: '1.6em' }}>
                <span style={{
                  width: 40, minWidth: 40, textAlign: 'right', paddingRight: 12,
                  color: '#3d4166', userSelect: 'none', flexShrink: 0,
                  borderRight: '1px solid rgba(45,49,72,0.5)',
                }}>
                  {i + 1}
                </span>
                <span style={{ paddingLeft: 12, whiteSpace: 'pre' }}>{line}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}

/* ── Composant principal ──────────────────────────────────────────── */
export default function FileExplorer({ directory, jumpToFile }) {
  const [rootEntries, setRootEntries] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const loadRoot = useCallback(async () => {
    if (!directory) return;
    try {
      const res = await fetch(`/api/terminals/fs?path=${encodeURIComponent(directory)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRootEntries(data.entries || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }, [directory]);

  useEffect(() => { loadRoot(); }, [loadRoot]);

  // Sélectionner et afficher le fichier cible quand on arrive depuis le diff
  useEffect(() => {
    if (!jumpToFile) return;
    setSelectedFile(jumpToFile);
  }, [jumpToFile]);

  if (!directory) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3d4166', fontSize: 12 }}>
      Aucun répertoire de travail
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Arbre de fichiers */}
      <div style={{
        width: 220, minWidth: 160, maxWidth: 300,
        borderRight: '1px solid rgba(45,49,72,0.6)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {/* En-tête arbre */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 10px', borderBottom: '1px solid rgba(45,49,72,0.6)',
          background: 'rgba(255,255,255,0.02)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#565f89', textTransform: 'uppercase', letterSpacing: '0.3px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {directory.replace(/\\/g, '/').split('/').filter(Boolean).pop() || directory}
          </span>
          <button
            onClick={loadRoot}
            title="Rafraîchir"
            style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}
          >
            ↺
          </button>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadError && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: '#ef4444' }}>{loadError}</div>
          )}
          {!loadError && !rootEntries && (
            <div style={{ padding: '8px 10px', fontSize: 11, color: '#565f89' }}>Chargement…</div>
          )}
          {rootEntries && rootEntries.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              selectedPath={selectedFile}
              onSelect={(e) => setSelectedFile(e.path)}
              jumpToFile={jumpToFile}
            />
          ))}
        </div>
      </div>

      {/* Visionneur */}
      <FileViewer filePath={selectedFile} />
    </div>
  );
}

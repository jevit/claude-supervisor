import { useState, useEffect, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import yaml from 'js-yaml';
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/atom-one-dark.min.css';
// Langages enregistrés — tree-shaking : seuls ceux listés sont bundlés
import langJs       from 'highlight.js/lib/languages/javascript';
import langTs       from 'highlight.js/lib/languages/typescript';
import langJson     from 'highlight.js/lib/languages/json';
import langCss      from 'highlight.js/lib/languages/css';
import langXml      from 'highlight.js/lib/languages/xml';
import langBash     from 'highlight.js/lib/languages/bash';
import langPython   from 'highlight.js/lib/languages/python';
import langRuby     from 'highlight.js/lib/languages/ruby';
import langGo       from 'highlight.js/lib/languages/go';
import langRust     from 'highlight.js/lib/languages/rust';
import langJava     from 'highlight.js/lib/languages/java';
import langCsharp   from 'highlight.js/lib/languages/csharp';
import langCpp      from 'highlight.js/lib/languages/cpp';
import langYaml     from 'highlight.js/lib/languages/yaml';
import langMarkdown from 'highlight.js/lib/languages/markdown';
import langIni      from 'highlight.js/lib/languages/ini';
import langSql      from 'highlight.js/lib/languages/sql';
import langPhp      from 'highlight.js/lib/languages/php';
import langKotlin   from 'highlight.js/lib/languages/kotlin';
import langSwift    from 'highlight.js/lib/languages/swift';
import langDockerfile from 'highlight.js/lib/languages/dockerfile';
hljs.registerLanguage('javascript', langJs);
hljs.registerLanguage('typescript', langTs);
hljs.registerLanguage('json',       langJson);
hljs.registerLanguage('css',        langCss);
hljs.registerLanguage('xml',        langXml);
hljs.registerLanguage('bash',       langBash);
hljs.registerLanguage('python',     langPython);
hljs.registerLanguage('ruby',       langRuby);
hljs.registerLanguage('go',         langGo);
hljs.registerLanguage('rust',       langRust);
hljs.registerLanguage('java',       langJava);
hljs.registerLanguage('csharp',     langCsharp);
hljs.registerLanguage('cpp',        langCpp);
hljs.registerLanguage('yaml',       langYaml);
hljs.registerLanguage('markdown',   langMarkdown);
hljs.registerLanguage('ini',        langIni);
hljs.registerLanguage('sql',        langSql);
hljs.registerLanguage('php',        langPhp);
hljs.registerLanguage('kotlin',     langKotlin);
hljs.registerLanguage('swift',      langSwift);
hljs.registerLanguage('dockerfile', langDockerfile);

/* ── Détection du langage à partir de l'extension ─────────────────── */
const EXT_LANG = {
  js: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', mjs: 'js', cjs: 'js',
  json: 'json', jsonc: 'json',
  md: 'md', mdx: 'md',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  sh: 'sh', bash: 'sh', zsh: 'sh',
  py: 'py', rb: 'rb', go: 'go', rs: 'rs', java: 'java',
  cs: 'cs', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  kt: 'kt', swift: 'swift', php: 'php', sql: 'sql',
  dockerfile: 'dockerfile',
  env: 'env', toml: 'env', ini: 'env', properties: 'env',
  yaml: 'yaml', yml: 'yaml',
};

/* ── Mapping ext → identifiant hljs ───────────────────────────────── */
const HLJS_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json',
  css: 'css', scss: 'css', less: 'css',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', cs: 'csharp', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
  kt: 'kotlin', swift: 'swift', php: 'php', sql: 'sql',
  dockerfile: 'dockerfile',
  env: 'ini', toml: 'ini', ini: 'ini', properties: 'ini',
  yaml: 'yaml', yml: 'yaml',
  md: 'markdown', mdx: 'markdown',
};

/* ── Découpe le HTML colorisé en lignes en fermant/rouvrant les spans ─ */
function splitHighlightedLines(html) {
  const lines = [];
  let current = '';
  let openSpans = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) { current += html.slice(i); break; }
      const tag = html.slice(i, end + 1);
      if (tag.startsWith('</')) openSpans.pop();
      else openSpans.push(tag);
      current += tag;
      i = end + 1;
    } else if (html[i] === '\n') {
      current += openSpans.map(() => '</span>').join('');
      lines.push(current);
      current = openSpans.join('');
      i++;
    } else {
      current += html[i];
      i++;
    }
  }
  if (current) lines.push(current);
  return lines;
}

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
  if (['js', 'jsx', 'mjs'].includes(ext)) return '🟨';
  if (['ts', 'tsx'].includes(ext)) return '🔷';
  if (['cs'].includes(ext)) return '💜';
  if (['java', 'kt'].includes(ext)) return '☕';
  if (['json', 'jsonc'].includes(ext)) return '📋';
  if (['md', 'mdx'].includes(ext)) return '📝';
  if (['css', 'scss', 'less'].includes(ext)) return '🎨';
  if (['html', 'htm', 'xml'].includes(ext)) return '🌐';
  if (['sh', 'bash', 'zsh'].includes(ext)) return '⚙';
  if (['py'].includes(ext)) return '🐍';
  if (['rb'].includes(ext)) return '💎';
  if (['go'].includes(ext)) return '🐹';
  if (['rs'].includes(ext)) return '🦀';
  if (['cpp', 'cc', 'h', 'hpp'].includes(ext)) return '⚡';
  if (['swift'].includes(ext)) return '🍎';
  if (['php'].includes(ext)) return '🐘';
  if (['sql'].includes(ext)) return '🗄';
  if (['dockerfile'].includes(ext) || name.toLowerCase() === 'dockerfile') return '🐳';
  if (['env', 'toml', 'yaml', 'yml', 'ini', 'properties'].includes(ext)) return '🔧';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼';
  if (['pdf'].includes(ext)) return '📕';
  if (['zip', 'tar', 'gz', 'bz2', '7z'].includes(ext)) return '📦';
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

/* ── Rendu YAML ───────────────────────────────────────────────────── */
function YamlValue({ value, depth = 0 }) {
  const [open, setOpen] = useState(depth < 3);

  if (value === null || value === undefined) {
    return <span style={{ color: '#565f89', fontStyle: 'italic' }}>null</span>;
  }
  if (typeof value === 'boolean') {
    return <span style={{ color: '#ff9e64' }}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span style={{ color: '#ff9e64' }}>{value}</span>;
  }
  if (typeof value === 'string') {
    return <span style={{ color: '#9ece6a' }}>"{value}"</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: '#565f89' }}>[]</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7dcfff', padding: 0, fontSize: 11 }}>
          {open ? '▾' : '▸'} [{value.length}]
        </button>
        {open && (
          <div style={{ paddingLeft: 16, borderLeft: '1px solid rgba(45,49,72,0.6)' }}>
            {value.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, padding: '1px 0' }}>
                <span style={{ color: '#565f89', flexShrink: 0 }}>{i}:</span>
                <YamlValue value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return <span style={{ color: '#565f89' }}>{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7dcfff', padding: 0, fontSize: 11 }}>
          {open ? '▾' : '▸'} {`{${keys.length}}`}
        </button>
        {open && (
          <div style={{ paddingLeft: 16, borderLeft: '1px solid rgba(45,49,72,0.6)' }}>
            {keys.map((k) => (
              <div key={k} style={{ display: 'flex', gap: 6, padding: '1px 0', flexWrap: 'wrap' }}>
                <span style={{ color: '#7aa2f7', flexShrink: 0 }}>{k}:</span>
                <YamlValue value={value[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span style={{ color: '#a0a8c0' }}>{String(value)}</span>;
}

function YamlViewer({ content }) {
  const parsed = useMemo(() => {
    try {
      return { data: yaml.load(content), error: null };
    } catch (err) {
      return { data: null, error: err.message };
    }
  }, [content]);

  if (parsed.error) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 11, color: '#ef4444' }}>
        Erreur YAML : {parsed.error}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', fontSize: 12, lineHeight: 1.7, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      <YamlValue value={parsed.data} depth={0} />
    </div>
  );
}

/* ── Visionneur de contenu ────────────────────────────────────────── */
function FileViewer({ filePath }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rendered, setRendered] = useState(true); // mode rendu par défaut pour .md/.yaml

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setContent(null);
    setError(null);
    fetch('/api/terminals/fs/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filePath]);

  // Remettre le mode rendu à chaque changement de fichier
  useEffect(() => { setRendered(true); }, [filePath]);

  const copy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const fileName = filePath ? filePath.replace(/\\/g, '/').split('/').pop() : '';
  const ext = extOf(fileName);
  const isMd = ['md', 'mdx'].includes(ext);
  const isYaml = ['yaml', 'yml'].includes(ext);
  const hasRenderedView = isMd || isYaml;
  const renderedHtml = useMemo(() => {
    if (!isMd || !content) return '';
    try { return DOMPurify.sanitize(marked.parse(content)); } catch { return ''; }
  }, [content, isMd]);
  const highlightedLines = useMemo(() => {
    if (!content) return [];
    const lang = HLJS_LANG[ext];
    if (!lang) return content.split('\n');
    try {
      const { value } = hljs.highlight(content, { language: lang, ignoreIllegals: true });
      return splitHighlightedLines(value);
    } catch {
      return content.split('\n');
    }
  }, [content, ext]);

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
        {/* Toggle source / rendu (MD et YAML) */}
        {hasRenderedView && content && (
          <div style={{ display: 'flex', border: '1px solid rgba(45,49,72,0.8)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
            {[{ id: true, label: isYaml ? '🌿 Arbre' : '👁 Rendu' }, { id: false, label: '</> Source' }].map((v) => (
              <button
                key={String(v.id)}
                onClick={() => setRendered(v.id)}
                style={{
                  background: rendered === v.id ? 'rgba(139,92,246,0.2)' : 'none',
                  color: rendered === v.id ? '#a78bfa' : '#565f89',
                  border: 'none', padding: '2px 8px', cursor: 'pointer', fontSize: 10,
                  fontWeight: rendered === v.id ? 700 : 400,
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
        {content !== null && !loading && isMd && rendered && (
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

        {/* Rendu YAML en arbre */}
        {content !== null && !loading && isYaml && rendered && (
          <YamlViewer content={content} />
        )}

        {/* Source avec numéros de ligne et coloration syntaxique */}
        {content !== null && !loading && (!hasRenderedView || !rendered) && (
          <pre style={{
            margin: 0, padding: '10px 0',
            fontSize: 11, lineHeight: 1.6,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: '#a0a8c0', background: 'transparent',
            whiteSpace: 'pre', overflowX: 'auto',
          }}>
            {highlightedLines.map((line, i) => (
              <div key={i} style={{ display: 'flex', minHeight: '1.6em' }}>
                <span style={{
                  width: 40, minWidth: 40, textAlign: 'right', paddingRight: 12,
                  color: '#3d4166', userSelect: 'none', flexShrink: 0,
                  borderRight: '1px solid rgba(45,49,72,0.5)',
                }}>
                  {i + 1}
                </span>
                {typeof line === 'string' && line.includes('<') ? (
                  <span style={{ paddingLeft: 12, whiteSpace: 'pre' }} dangerouslySetInnerHTML={{ __html: line || '\u200b' }} />
                ) : (
                  <span style={{ paddingLeft: 12, whiteSpace: 'pre' }}>{line || '\u200b'}</span>
                )}
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

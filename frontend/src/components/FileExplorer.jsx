import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import yaml from 'js-yaml';
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/atom-one-dark.min.css';
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

/* ── Constantes ────────────────────────────────────────────────────── */
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
  csv: 'csv',
};

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

/* ── Helpers ───────────────────────────────────────────────────────── */
function extOf(name) {
  if (!name) return '';
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}
function langOf(name) { return EXT_LANG[extOf(name)] || 'text'; }
function normPath(p) { return (p || '').replace(/\\/g, '/').toLowerCase(); }

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
  if (['csv'].includes(ext)) return '📊';
  if (['dockerfile'].includes(ext) || name.toLowerCase() === 'dockerfile') return '🐳';
  if (['env', 'toml', 'yaml', 'yml', 'ini', 'properties'].includes(ext)) return '🔧';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼';
  if (['pdf'].includes(ext)) return '📕';
  if (['zip', 'tar', 'gz', 'bz2', '7z'].includes(ext)) return '📦';
  return '📄';
}

/* ── Découpe le HTML hljs par lignes en gérant les spans ouverts ───── */
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

/* ── Parser CSV (gère les champs quotés et les séparateurs , ; \t) ── */
function parseCsv(text) {
  const rawLines = text.split('\n').filter((l) => l.trim());
  if (!rawLines.length) return { headers: [], rows: [], sep: ',' };
  const sep = rawLines[0].includes('\t') ? '\t' : rawLines[0].includes(';') ? ';' : ',';
  const parseRow = (line) => {
    const fields = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (line[i] === sep && !inQ) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += line[i];
      }
    }
    fields.push(cur.trim());
    return fields;
  };
  return { headers: parseRow(rawLines[0]), rows: rawLines.slice(1).map(parseRow), sep };
}

/* ── Segments de breadcrumb ────────────────────────────────────────── */
function pathSegments(p) {
  const norm = (p || '').replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  return parts.map((seg, i) => {
    const isWinDrive = /^[A-Z]:$/i.test(parts[0]);
    const prefix = isWinDrive ? '' : '/';
    const joined = parts.slice(0, i + 1).join('/');
    return { label: seg, path: prefix + joined + (i === 0 && isWinDrive ? '/' : '') };
  });
}

/* ── Rendu YAML / JSON générique ───────────────────────────────────── */
function TreeValue({ value, depth = 0 }) {
  const [open, setOpen] = useState(depth < 3);
  if (value === null || value === undefined)
    return <span style={{ color: '#565f89', fontStyle: 'italic' }}>null</span>;
  if (typeof value === 'boolean')
    return <span style={{ color: '#ff9e64' }}>{String(value)}</span>;
  if (typeof value === 'number')
    return <span style={{ color: '#ff9e64' }}>{value}</span>;
  if (typeof value === 'string')
    return <span style={{ color: '#9ece6a' }}>"{value}"</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span style={{ color: '#565f89' }}>[]</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} style={btnStyle}>
          {open ? '▾' : '▸'} [{value.length}]
        </button>
        {open && (
          <div style={treeIndent}>
            {value.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, padding: '1px 0' }}>
                <span style={{ color: '#565f89', flexShrink: 0 }}>{i}:</span>
                <TreeValue value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return <span style={{ color: '#565f89' }}>{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setOpen((o) => !o)} style={btnStyle}>
          {open ? '▾' : '▸'} {`{${keys.length}}`}
        </button>
        {open && (
          <div style={treeIndent}>
            {keys.map((k) => (
              <div key={k} style={{ display: 'flex', gap: 6, padding: '1px 0', flexWrap: 'wrap' }}>
                <span style={{ color: '#7aa2f7', flexShrink: 0 }}>{k}:</span>
                <TreeValue value={value[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span style={{ color: '#a0a8c0' }}>{String(value)}</span>;
}
const btnStyle = { background: 'none', border: 'none', cursor: 'pointer', color: '#7dcfff', padding: 0, fontSize: 11 };
const treeIndent = { paddingLeft: 16, borderLeft: '1px solid rgba(45,49,72,0.6)' };

function YamlViewer({ content }) {
  const parsed = useMemo(() => {
    try { return { data: yaml.load(content), error: null }; }
    catch (err) { return { data: null, error: err.message }; }
  }, [content]);
  if (parsed.error)
    return <div style={{ padding: '12px 16px', fontSize: 11, color: '#ef4444' }}>Erreur YAML : {parsed.error}</div>;
  return (
    <div style={{ padding: '12px 16px', fontSize: 12, lineHeight: 1.7, fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      <TreeValue value={parsed.data} depth={0} />
    </div>
  );
}

function JsonViewer({ content }) {
  const parsed = useMemo(() => {
    try { return { data: JSON.parse(content), error: null }; }
    catch (err) { return { data: null, error: err.message }; }
  }, [content]);
  if (parsed.error)
    return <div style={{ padding: '12px 16px', fontSize: 11, color: '#ef4444' }}>Erreur JSON : {parsed.error}</div>;
  return (
    <div style={{ padding: '12px 16px', fontSize: 12, lineHeight: 1.7, fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      <TreeValue value={parsed.data} depth={0} />
    </div>
  );
}

/* ── Lecteur CSV ───────────────────────────────────────────────────── */
function CsvViewer({ content }) {
  const { headers, rows } = useMemo(() => parseCsv(content), [content]);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    if (sortCol === null) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol] || '';
      const bv = b[sortCol] || '';
      const num = !isNaN(av) && !isNaN(bv);
      const cmp = num ? Number(av) - Number(bv) : av.localeCompare(bv, undefined, { sensitivity: 'base' });
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortCol, sortAsc]);

  const toggleSort = (i) => {
    if (sortCol === i) setSortAsc((a) => !a);
    else { setSortCol(i); setSortAsc(true); }
  };

  if (!headers.length) return <div style={{ padding: 16, fontSize: 11, color: '#565f89' }}>CSV vide</div>;

  return (
    <div style={{ overflow: 'auto', padding: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%', fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} onClick={() => toggleSort(i)} style={{
                padding: '4px 12px', textAlign: 'left', cursor: 'pointer', userSelect: 'none',
                color: sortCol === i ? '#a78bfa' : '#7aa2f7',
                borderBottom: '1px solid rgba(45,49,72,0.8)',
                background: 'rgba(255,255,255,0.03)',
                whiteSpace: 'nowrap',
              }}>
                {h} {sortCol === i ? (sortAsc ? '▴' : '▾') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 ? 'rgba(255,255,255,0.02)' : 'none' }}>
              {headers.map((_, ci) => (
                <td key={ci} style={{
                  padding: '3px 12px', color: '#a0a8c0',
                  borderBottom: '1px solid rgba(45,49,72,0.3)',
                  whiteSpace: 'nowrap', maxWidth: 300,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: '6px 12px', fontSize: 10, color: '#565f89' }}>
        {sorted.length} ligne{sorted.length > 1 ? 's' : ''} · {headers.length} colonnes
      </div>
    </div>
  );
}

/* ── Lecteur .env / .properties ────────────────────────────────────── */
const SECRET_RE = /SECRET|PASSWORD|PASSWD|TOKEN|KEY|PASS|PWD|AUTH|CREDENTIAL|PRIVATE|API_KEY/i;

function EnvViewer({ content }) {
  const [showSecrets, setShowSecrets] = useState(false);

  const entries = useMemo(() => {
    return content.split('\n').map((line, i) => {
      const raw = line.trim();
      if (!raw || raw.startsWith('#')) return { type: raw.startsWith('#') ? 'comment' : 'blank', raw, i };
      const eq = raw.indexOf('=');
      if (eq === -1) return { type: 'raw', raw, i };
      return { type: 'kv', key: raw.slice(0, eq), value: raw.slice(eq + 1), i };
    });
  }, [content]);

  const hasSecrets = entries.some((e) => e.type === 'kv' && SECRET_RE.test(e.key));

  return (
    <div style={{ padding: '8px 0' }}>
      {hasSecrets && (
        <div style={{ padding: '4px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#565f89' }}>Secrets détectés</span>
          <button onClick={() => setShowSecrets((s) => !s)} style={{
            background: showSecrets ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)',
            border: `1px solid ${showSecrets ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.4)'}`,
            borderRadius: 4, color: showSecrets ? '#ef4444' : '#a78bfa',
            cursor: 'pointer', fontSize: 10, padding: '2px 8px',
          }}>
            {showSecrets ? '🔓 Masquer' : '🔑 Afficher'}
          </button>
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
        <tbody>
          {entries.map((e) => {
            if (e.type === 'comment') return (
              <tr key={e.i}>
                <td colSpan={2} style={{ padding: '2px 12px', color: '#565f89', fontStyle: 'italic' }}>{e.raw}</td>
              </tr>
            );
            if (e.type === 'blank') return null;
            if (e.type === 'raw') return (
              <tr key={e.i}>
                <td colSpan={2} style={{ padding: '2px 12px', color: '#a0a8c0' }}>{e.raw}</td>
              </tr>
            );
            const isSecret = SECRET_RE.test(e.key);
            const displayVal = isSecret && !showSecrets ? '••••••••' : e.value;
            return (
              <tr key={e.i} style={{ borderBottom: '1px solid rgba(45,49,72,0.3)' }}>
                <td style={{ padding: '3px 12px', color: '#7aa2f7', whiteSpace: 'nowrap', verticalAlign: 'top', width: '40%' }}>
                  {e.key}
                </td>
                <td style={{ padding: '3px 12px', color: isSecret && !showSecrets ? '#565f89' : '#9ece6a', wordBreak: 'break-all' }}>
                  {displayVal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Nœud de l'arbre ──────────────────────────────────────────────── */
function TreeNode({ entry, depth, selectedPath, onSelect, jumpToFile }) {
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    if (!jumpToFile || entry.type !== 'dir') return;
    const target = normPath(jumpToFile);
    const self = normPath(entry.path);
    if (target.startsWith(self + '/')) {
      setOpen(true);
      if (children === null) loadChildren();
    }
  }, [jumpToFile, entry.path, entry.type, children, loadChildren]);

  const toggle = async () => {
    if (entry.type !== 'dir') { onSelect(entry); return; }
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
        <span style={{ fontSize: 12, flexShrink: 0 }}>{isDir ? (open ? '📂' : '📁') : fileIcon(entry.name)}</span>
        <span style={{
          fontSize: 12, color: isDir ? '#c0caf5' : '#a0a8c0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: isSelected ? 600 : 400,
        }}>
          {entry.name}
        </span>
      </div>
      {isDir && open && children && children.map((child) => (
        <TreeNode key={child.path} entry={child} depth={depth + 1}
          selectedPath={selectedPath} onSelect={onSelect} jumpToFile={jumpToFile} />
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
  const [rendered, setRendered] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const scrollRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!filePath) return;
    setLoading(true);
    setContent(null);
    setError(null);
    setQuery('');
    setShowSearch(false);
    fetch('/api/terminals/fs/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: filePath }) })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setContent(d.content); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filePath]);

  useEffect(() => { setRendered(true); }, [filePath]);

  // Ctrl+F pour ouvrir la recherche
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setShowSearch(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const copy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const fileName = filePath ? filePath.replace(/\\/g, '/').split('/').pop() : '';
  const ext = extOf(fileName);
  const isMd    = ['md', 'mdx'].includes(ext);
  const isYaml  = ['yaml', 'yml'].includes(ext);
  const isJson  = ['json', 'jsonc'].includes(ext);
  const isCsv   = ext === 'csv';
  const isEnv   = ['env', 'properties', 'ini', 'toml'].includes(ext) || fileName === '.env';
  const hasRenderedView = isMd || isYaml || isJson || isCsv || isEnv;

  const renderedHtml = useMemo(() => {
    if (!isMd || !content) return '';
    try { return DOMPurify.sanitize(marked.parse(content)); } catch { return ''; }
  }, [content, isMd]);

  const rawLines = useMemo(() => (content ? content.split('\n') : []), [content]);

  const highlightedLines = useMemo(() => {
    if (!content) return [];
    const lang = HLJS_LANG[ext];
    if (!lang) return rawLines;
    try {
      const { value } = hljs.highlight(content, { language: lang, ignoreIllegals: true });
      return splitHighlightedLines(value);
    } catch {
      return rawLines;
    }
  }, [content, ext, rawLines]);

  // Recherche : calcule les indices des lignes correspondantes
  const isGoto = /^:\d+$/.test(query.trim());
  const gotoLine = isGoto ? parseInt(query.slice(1), 10) - 1 : -1;

  const matches = useMemo(() => {
    if (!query || isGoto) return [];
    const q = query.toLowerCase();
    return rawLines.reduce((acc, line, i) => { if (line.toLowerCase().includes(q)) acc.push(i); return acc; }, []);
  }, [query, rawLines, isGoto]);

  // Scroll vers le match courant
  useEffect(() => {
    const lineIdx = isGoto ? gotoLine : matches[matchIdx];
    if (lineIdx == null || lineIdx < 0 || !scrollRef.current) return;
    const lineH = 18; // px approximatif par ligne
    const target = lineIdx * lineH;
    const container = scrollRef.current;
    const center = target - container.clientHeight / 2;
    container.scrollTop = Math.max(0, center);
  }, [matchIdx, matches, isGoto, gotoLine]);

  useEffect(() => { setMatchIdx(0); }, [matches]);

  const prevMatch = () => setMatchIdx((i) => (i - 1 + matches.length) % matches.length);
  const nextMatch = () => setMatchIdx((i) => (i + 1) % matches.length);

  const renderedViewLabel = isYaml ? '🌿 Arbre' : isJson ? '🌿 Arbre' : isCsv ? '📊 Tableau' : isEnv ? '🔑 Table' : '👁 Rendu';

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
        {/* Toggle rendu / source */}
        {hasRenderedView && content && (
          <div style={{ display: 'flex', border: '1px solid rgba(45,49,72,0.8)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
            {[{ id: true, label: renderedViewLabel }, { id: false, label: '</> Source' }].map((v) => (
              <button key={String(v.id)} onClick={() => setRendered(v.id)} style={{
                background: rendered === v.id ? 'rgba(139,92,246,0.2)' : 'none',
                color: rendered === v.id ? '#a78bfa' : '#565f89',
                border: 'none', padding: '2px 8px', cursor: 'pointer', fontSize: 10,
                fontWeight: rendered === v.id ? 700 : 400,
                borderRight: v.id === true ? '1px solid rgba(45,49,72,0.8)' : 'none',
              }}>{v.label}</button>
            ))}
          </div>
        )}
        <span style={{ fontSize: 10, color: '#565f89', flexShrink: 0, fontFamily: 'monospace' }}>
          {langOf(fileName).toUpperCase()}
        </span>
        {/* Bouton wrap (source uniquement) */}
        {content && (!hasRenderedView || !rendered) && (
          <button onClick={() => setWrap((w) => !w)} title={wrap ? 'Désactiver le retour à la ligne' : 'Activer le retour à la ligne'} style={{
            background: wrap ? 'rgba(139,92,246,0.2)' : 'none',
            border: '1px solid rgba(45,49,72,0.6)', borderRadius: 4,
            color: wrap ? '#a78bfa' : '#565f89', cursor: 'pointer', fontSize: 10, padding: '2px 6px', flexShrink: 0,
          }}>↵</button>
        )}
        {/* Bouton recherche */}
        {content && (
          <button onClick={() => { setShowSearch((s) => !s); setTimeout(() => searchRef.current?.focus(), 50); }} title="Rechercher (Ctrl+F)" style={{
            background: showSearch ? 'rgba(139,92,246,0.2)' : 'none',
            border: '1px solid rgba(45,49,72,0.6)', borderRadius: 4,
            color: showSearch ? '#a78bfa' : '#565f89', cursor: 'pointer', fontSize: 10, padding: '2px 6px', flexShrink: 0,
          }}>🔍</button>
        )}
        {content && (
          <button onClick={copy} title="Copier le contenu" style={{
            background: 'none', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 4,
            color: copied ? '#4ade80' : '#a78bfa', cursor: 'pointer', fontSize: 10, padding: '2px 7px', flexShrink: 0,
          }}>{copied ? '✓ Copié' : 'Copier'}</button>
        )}
      </div>

      {/* Barre de recherche */}
      {showSearch && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderBottom: '1px solid rgba(45,49,72,0.6)',
          background: 'rgba(255,255,255,0.02)', flexShrink: 0,
        }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.shiftKey ? prevMatch() : nextMatch(); } if (e.key === 'Escape') setShowSearch(false); }}
            placeholder="Rechercher… ou :42 pour aller à la ligne"
            style={{
              flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(45,49,72,0.8)',
              borderRadius: 4, color: '#c0caf5', fontSize: 11, padding: '3px 8px', outline: 'none',
            }}
          />
          {isGoto && gotoLine >= 0 && (
            <span style={{ fontSize: 10, color: '#a78bfa', flexShrink: 0 }}>Ligne {gotoLine + 1}</span>
          )}
          {!isGoto && query && (
            <>
              <span style={{ fontSize: 10, color: matches.length ? '#a78bfa' : '#ef4444', flexShrink: 0 }}>
                {matches.length ? `${matchIdx + 1} / ${matches.length}` : '0 résultat'}
              </span>
              <button onClick={prevMatch} disabled={!matches.length} style={searchNavBtn}>▲</button>
              <button onClick={nextMatch} disabled={!matches.length} style={searchNavBtn}>▼</button>
            </>
          )}
          <button onClick={() => setShowSearch(false)} style={{ ...searchNavBtn, color: '#565f89' }}>✕</button>
        </div>
      )}

      {/* Contenu */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {loading && <div style={{ padding: 16, fontSize: 11, color: '#565f89' }}>Chargement…</div>}
        {error && <div style={{ padding: 16, fontSize: 11, color: '#ef4444' }}>{error}</div>}

        {content !== null && !loading && isMd && rendered && (
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }}
            style={{ padding: '16px 20px', color: '#c0caf5', fontSize: 13, lineHeight: 1.7, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}
            className="md-preview" />
        )}
        {content !== null && !loading && isYaml && rendered && <YamlViewer content={content} />}
        {content !== null && !loading && isJson && rendered && <JsonViewer content={content} />}
        {content !== null && !loading && isCsv && rendered && <CsvViewer content={content} />}
        {content !== null && !loading && isEnv && rendered && <EnvViewer content={content} />}

        {/* Source avec numéros de ligne et coloration syntaxique */}
        {content !== null && !loading && (!hasRenderedView || !rendered) && (
          <pre style={{
            margin: 0, padding: '10px 0',
            fontSize: 11, lineHeight: 1.6,
            fontFamily: "'JetBrains Mono','Fira Code',monospace",
            color: '#a0a8c0', background: 'transparent',
            whiteSpace: wrap ? 'pre-wrap' : 'pre',
            overflowX: wrap ? 'hidden' : 'auto',
          }}>
            {highlightedLines.map((line, i) => {
              const isMatch = matches.includes(i) || (isGoto && i === gotoLine);
              const isCurrent = (matches.length && matches[matchIdx] === i) || (isGoto && i === gotoLine);
              return (
                <div key={i} style={{
                  display: 'flex', minHeight: '1.6em',
                  background: isCurrent ? 'rgba(167,139,250,0.18)' : isMatch ? 'rgba(167,139,250,0.07)' : 'none',
                }}>
                  <span style={{
                    width: 40, minWidth: 40, textAlign: 'right', paddingRight: 12,
                    color: isCurrent ? '#a78bfa' : '#3d4166',
                    userSelect: 'none', flexShrink: 0,
                    borderRight: '1px solid rgba(45,49,72,0.5)',
                  }}>{i + 1}</span>
                  {typeof line === 'string' && line.includes('<') ? (
                    <span style={{ paddingLeft: 12, whiteSpace: wrap ? 'pre-wrap' : 'pre', wordBreak: wrap ? 'break-all' : 'normal' }}
                      dangerouslySetInnerHTML={{ __html: line || '\u200b' }} />
                  ) : (
                    <span style={{ paddingLeft: 12, whiteSpace: wrap ? 'pre-wrap' : 'pre' }}>{line || '\u200b'}</span>
                  )}
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}
const searchNavBtn = { background: 'none', border: '1px solid rgba(45,49,72,0.6)', borderRadius: 3, color: '#a78bfa', cursor: 'pointer', fontSize: 10, padding: '2px 5px' };

/* ── Breadcrumb ────────────────────────────────────────────────────── */
function Breadcrumb({ browsePath, onNavigate }) {
  const segs = pathSegments(browsePath);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, flex: 1, overflow: 'hidden', minWidth: 0 }}>
      {segs.map((seg, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          {i > 0 && <span style={{ color: '#3d4166', fontSize: 9, flexShrink: 0 }}>/</span>}
          <button onClick={() => onNavigate(seg.path)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
            color: i === segs.length - 1 ? '#c0caf5' : '#565f89',
            fontSize: 11, fontWeight: i === segs.length - 1 ? 700 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: i === segs.length - 1 ? 120 : 60,
          }} title={seg.path}>{seg.label}</button>
        </span>
      ))}
    </div>
  );
}

/* ── Composant principal ──────────────────────────────────────────── */
export default function FileExplorer({ directory, jumpToFile }) {
  const [browsePath, setBrowsePath] = useState(directory || '');
  const [rootEntries, setRootEntries] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => { if (directory) setBrowsePath(directory); }, [directory]);

  const loadRoot = useCallback(async (path) => {
    const target = path || browsePath;
    if (!target) return;
    try {
      const res = await fetch(`/api/terminals/fs?path=${encodeURIComponent(target)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRootEntries(data.entries || []);
      setBrowsePath(target);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }, [browsePath]);

  useEffect(() => { loadRoot(directory); }, [directory]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (jumpToFile) setSelectedFile(jumpToFile); }, [jumpToFile]);

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
        {/* En-tête avec breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 8px', borderBottom: '1px solid rgba(45,49,72,0.6)',
          background: 'rgba(255,255,255,0.02)', flexShrink: 0, minWidth: 0,
        }}>
          <Breadcrumb browsePath={browsePath} onNavigate={(p) => loadRoot(p)} />
          <button onClick={() => loadRoot(browsePath)} title="Rafraîchir"
            style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}>
            ↺
          </button>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadError && <div style={{ padding: '8px 10px', fontSize: 11, color: '#ef4444' }}>{loadError}</div>}
          {!loadError && !rootEntries && <div style={{ padding: '8px 10px', fontSize: 11, color: '#565f89' }}>Chargement…</div>}
          {rootEntries && rootEntries.map((entry) => (
            <TreeNode key={entry.path} entry={entry} depth={0}
              selectedPath={selectedFile}
              onSelect={(e) => setSelectedFile(e.path)}
              jumpToFile={jumpToFile} />
          ))}
        </div>
      </div>

      {/* Visionneur */}
      <FileViewer filePath={selectedFile} />
    </div>
  );
}

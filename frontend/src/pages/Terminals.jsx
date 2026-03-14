import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import 'xterm/css/xterm.css';
import GitDiffPanel from '../components/GitDiffPanel';

// Layouts disponibles en mode grille
const LAYOUTS = [
  { id: '1x2', cols: 1, rows: 2, label: '1×2', max: 2 },
  { id: '2x1', cols: 2, rows: 1, label: '2×1', max: 2 },
  { id: '2x2', cols: 2, rows: 2, label: '2×2', max: 4 },
  { id: '2x3', cols: 2, rows: 3, label: '2×3', max: 6 },
];

/**
 * Composant d'un terminal individuel avec xterm.js.
 * Gère le replay du buffer au montage et à chaque reconnexion WS.
 * En mode ghost (session interrompue), affiche le buffer sauvegardé + bannière de reprise.
 */
function TerminalView({ terminalId, terminalName, terminalDirectory, terminalStatus, onClose, onRename, onResume, compact = false }) {
  const containerRef   = useRef(null);
  const xtermRef       = useRef(null);
  const fitAddonRef    = useRef(null);
  const searchAddonRef = useRef(null);
  const wsRef          = useRef(null);
  const destroyedRef   = useRef(false);
  const reconnTimerRef = useRef(null);
  const searchInputRef = useRef(null);

  const isGhost = terminalStatus === 'ghost';
  const [resuming,          setResuming]          = useState(false);

  const [editing,           setEditing]           = useState(false);
  const [editName,          setEditName]          = useState(terminalName || '');
  const [activeTab,         setActiveTab]         = useState('terminal'); // 'terminal' | 'diff'
  const [diffEverOpened,    setDiffEverOpened]    = useState(false);
  const [replaying,         setReplaying]         = useState(false);

  const switchTab = (tab) => {
    if (tab === 'diff') setDiffEverOpened(true);
    setActiveTab(tab);
  };
  const [wsStatus,    setWsStatus]    = useState('connecting');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase,   setMatchCase]   = useState(false);
  const [matchInfo,   setMatchInfo]   = useState(null); // { current, total } | null

  useEffect(() => {
    if (!containerRef.current || !terminalId) return;
    destroyedRef.current = false;

    /* ── Initialisation xterm ─────────────────────────────────── */
    const xterm = new XTerm({
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor:     '#c0caf5',
        selection:  'rgba(139, 92, 246, 0.3)',
      },
      fontFamily:  '"Cascadia Code", "Fira Code", Consolas, monospace',
      fontSize:    compact ? 11 : 13,
      cursorBlink: true,
      scrollback:  5000,
      rightClickSelectsWord: true,
    });

    const fitAddon    = new FitAddon();
    const searchAddon = new SearchAddon();
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.open(containerRef.current);
    requestAnimationFrame(() => fitAddon.fit());

    xtermRef.current       = xterm;
    fitAddonRef.current    = fitAddon;
    searchAddonRef.current = searchAddon;

    /* ── Copier/coller ────────────────────────────────────────── */
    xterm.attachCustomKeyEventHandler((e) => {
      // Ctrl+F — ouvrir/fermer la recherche
      if (e.ctrlKey && e.key === 'f' && e.type === 'keydown') {
        setSearchOpen((v) => !v);
        return false;
      }
      // Échap — fermer la recherche si ouverte
      if (e.key === 'Escape' && e.type === 'keydown') {
        setSearchOpen(false);
        searchAddon.clearDecorations?.();
        return false;
      }
      if (e.ctrlKey && e.key === 'c' && xterm.hasSelection()) {
        navigator.clipboard.writeText(xterm.getSelection());
        return false;
      }
      if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
        if (e.type === 'keydown') {
          navigator.clipboard.readText().then((text) => {
            if (text) fetch(`/api/terminals/${terminalId}/write`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: text }),
            }).catch(() => {});
          }).catch(() => {});
        }
        return false;
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        navigator.clipboard.writeText(xterm.getSelection());
        return false;
      }
      return true;
    });

    containerRef.current.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        if (text) fetch(`/api/terminals/${terminalId}/write`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: text }),
        }).catch(() => {});
      }).catch(() => {});
    });

    /* ── Saisie utilisateur → backend (desactive en mode ghost) ── */
    if (!isGhost) {
      xterm.onData((data) => {
        fetch(`/api/terminals/${terminalId}/write`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        }).catch(() => {});
      });
    }

    /* ── Focus auto sur le terminal (hors recherche) ─────────── */
    containerRef.current?.addEventListener('click', () => {
      if (!searchInputRef.current?.matches(':focus')) xterm.focus();
    });

    /* ── Resize ───────────────────────────────────────────────── */
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      fetch(`/api/terminals/${terminalId}/resize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: xterm.cols, rows: xterm.rows }),
      }).catch(() => {});
    });
    resizeObserver.observe(containerRef.current);

    /* ── Replay du buffer ─────────────────────────────────────── */
    const replayBuffer = async () => {
      if (destroyedRef.current) return;
      setReplaying(true);
      try {
        const res  = await fetch(`/api/terminals/${terminalId}/output?last=50000`);
        const data = await res.json();
        if (!destroyedRef.current && data.output) {
          xterm.reset();             // repart d'un état propre
          xterm.write(data.output);  // rejoue tout le buffer
          xterm.scrollToBottom();
        }
      } catch {}
      if (!destroyedRef.current) setReplaying(false);
    };

    /* ── WebSocket avec reconnexion automatique ───────────────── */
    const wsUrl = `ws://${window.location.hostname}:3001`;
    let reconnectDelay = 1000;

    const connect = () => {
      if (destroyedRef.current) return;
      setWsStatus('connecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyedRef.current) { ws.close(); return; }
        reconnectDelay = 1000; // reset le backoff
        setWsStatus('open');
        // Re-rejoue le buffer pour combler les trous pendant la déconnexion
        replayBuffer();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'terminal:output' && msg.data?.terminalId === terminalId) {
            if (!destroyedRef.current) xterm.write(msg.data.data);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (destroyedRef.current) return;
        setWsStatus('closed');
        // Reconnexion avec backoff exponentiel (max 10s)
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        reconnTimerRef.current = setTimeout(connect, reconnectDelay);
      };
    };

    // En mode ghost : replay du buffer uniquement, pas de WS live
    if (isGhost) {
      replayBuffer();
      return () => {
        destroyedRef.current = true;
        resizeObserver.disconnect();
        xterm.dispose();
      };
    }

    connect(); // connexion initiale

    return () => {
      destroyedRef.current = true;
      clearTimeout(reconnTimerRef.current);
      resizeObserver.disconnect();
      wsRef.current?.close();
      xterm.dispose();
    };
  }, [terminalId, compact]);

  /* ── Focus input quand la barre s'ouvre ──────────────────────── */
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 30);
    } else {
      setMatchInfo(null);
      searchAddonRef.current?.clearDecorations?.();
      xtermRef.current?.focus();
    }
  }, [searchOpen]);

  /* ── Refit xterm quand on revient sur l'onglet terminal ─────── */
  useEffect(() => {
    if (activeTab === 'terminal' && fitAddonRef.current) {
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [activeTab]);

  /* ── Lancer la recherche dès que la query/options changent ──── */
  useEffect(() => {
    if (!searchOpen || !searchAddonRef.current) return;
    if (!searchQuery) {
      searchAddonRef.current.clearDecorations?.();
      setMatchInfo(null);
      return;
    }
    const found = searchAddonRef.current.findNext(searchQuery, {
      caseSensitive: matchCase,
      incremental: true,
      decorations: {
        matchBackground:              '#f59e0b33',
        matchBorder:                  '#f59e0b',
        matchOverviewRuler:           '#f59e0b',
        activeMatchBackground:        '#f59e0b88',
        activeMatchBorder:            '#f59e0b',
        activeMatchColorOverviewRuler: '#f59e0b',
      },
    });
    setMatchInfo(found ? { found: true } : { found: false });
  }, [searchQuery, matchCase, searchOpen]);

  const searchNext = () => {
    if (!searchAddonRef.current || !searchQuery) return;
    searchAddonRef.current.findNext(searchQuery, { caseSensitive: matchCase });
  };

  const searchPrev = () => {
    if (!searchAddonRef.current || !searchQuery) return;
    searchAddonRef.current.findPrevious(searchQuery, { caseSensitive: matchCase });
  };

  const headerHeight = compact ? 28 : 36;

  const srchBtnStyle = {
    background: 'none', border: '1px solid #2a2b3d', borderRadius: 4,
    color: '#a9b1d6', cursor: 'pointer', fontSize: 11, padding: '2px 7px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barre de titre avec onglets */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: compact ? '0 6px' : '0 10px',
        height: headerHeight, boxSizing: 'border-box',
        background: '#1a1b26', borderBottom: '1px solid var(--border)', flexShrink: 0,
        gap: 6,
      }}>
        {/* Gauche : dot WS + nom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
          <span
            title={replaying ? 'Replay…' : wsStatus === 'open' ? 'Connecté' : wsStatus === 'connecting' ? 'Reconnexion…' : 'Déconnecté'}
            style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              background: replaying ? '#f59e0b' : wsStatus === 'open' ? '#22c55e' : wsStatus === 'connecting' ? '#f59e0b' : '#ef4444',
              animation: (wsStatus !== 'open' || replaying) ? 'ws-blink 1s ease-in-out infinite' : 'none',
            }}
          />
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); if (editName.trim()) { onRename(terminalId, editName.trim()); setEditing(false); } }} style={{ display: 'flex' }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                onBlur={() => { if (editName.trim()) onRename(terminalId, editName.trim()); setEditing(false); }}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 6px', color: '#c0caf5', fontSize: compact ? 10 : 12, fontFamily: 'monospace', width: 130 }}
              />
            </form>
          ) : (
            <span onDoubleClick={() => setEditing(true)} title="Double-cliquer pour renommer"
              style={{ fontSize: compact ? 10 : 12, color: '#c0caf5', fontFamily: 'monospace', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {terminalName || `Terminal ${terminalId?.substring(0, 8)}`}
            </span>
          )}
        </div>

        {/* Centre : onglets >_ Terminal | ⎇ Git Diff */}
        <div style={{ display: 'flex', flexShrink: 0, border: '1px solid #2a2b3d', borderRadius: 5, overflow: 'hidden' }}>
          {[
            { id: 'terminal', label: compact ? '>_' : '>_ Terminal' },
            { id: 'diff',     label: compact ? '⎇'  : '⎇ Git Diff'  },
          ].map((tab) => (
            <button key={tab.id} onClick={() => switchTab(tab.id)} style={{
              background: activeTab === tab.id ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: activeTab === tab.id ? '#c0caf5' : '#565f89',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #8b5cf6' : '2px solid transparent',
              borderRight: tab.id === 'terminal' ? '1px solid #2a2b3d' : 'none',
              padding: compact ? '0 7px' : '0 11px',
              height: '100%', cursor: 'pointer',
              fontSize: compact ? 10 : 11,
              fontFamily: 'monospace', fontWeight: activeTab === tab.id ? 700 : 400,
              transition: 'background 0.15s, color 0.15s',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Droite : recherche + fermer */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => setSearchOpen((v) => !v)} title="Rechercher (Ctrl+F)" style={{
            background: searchOpen ? 'rgba(139,92,246,0.25)' : 'none',
            color: searchOpen ? '#8b5cf6' : '#c0caf5',
            border: '1px solid var(--border)', borderRadius: 4,
            padding: compact ? '1px 5px' : '2px 7px',
            cursor: 'pointer', fontSize: compact ? 10 : 11, fontWeight: 600,
          }}>🔍</button>
          <button onClick={onClose} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, padding: compact ? '1px 6px' : '2px 10px', cursor: 'pointer', fontSize: compact ? 10 : 11 }}>×</button>
        </div>
      </div>

      {/* Barre de recherche */}
      {searchOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', background: '#1f2335',
          borderBottom: '1px solid #2a2b3d', flexShrink: 0,
        }}>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')       { e.shiftKey ? searchPrev() : searchNext(); }
              if (e.key === 'Escape')      { setSearchOpen(false); }
              if (e.key === 'ArrowDown')   { searchNext(); }
              if (e.key === 'ArrowUp')     { searchPrev(); }
            }}
            placeholder="Rechercher…"
            style={{
              flex: 1, background: '#1a1b26', border: '1px solid #2a2b3d',
              borderRadius: 4, padding: '3px 8px', color: '#c0caf5',
              fontSize: 12, fontFamily: 'monospace', outline: 'none',
              borderColor: matchInfo?.found === false ? '#ef4444' : searchQuery ? '#8b5cf6' : '#2a2b3d',
            }}
          />
          {/* Résultat */}
          {searchQuery && (
            <span style={{ fontSize: 11, color: matchInfo?.found === false ? '#ef4444' : '#a9b1d6', whiteSpace: 'nowrap' }}>
              {matchInfo?.found === false ? 'Aucun résultat' : ''}
            </span>
          )}
          {/* Précédent / Suivant */}
          <button onClick={searchPrev} title="Précédent (Shift+Enter)" style={srchBtnStyle}>▲</button>
          <button onClick={searchNext} title="Suivant (Enter)" style={srchBtnStyle}>▼</button>
          {/* Casse */}
          <button
            onClick={() => setMatchCase((v) => !v)}
            title="Respecter la casse"
            style={{ ...srchBtnStyle, background: matchCase ? 'rgba(139,92,246,0.25)' : 'none', color: matchCase ? '#8b5cf6' : '#a9b1d6', fontFamily: 'monospace' }}
          >
            Aa
          </button>
          {/* Fermer */}
          <button onClick={() => setSearchOpen(false)} title="Fermer (Échap)" style={{ ...srchBtnStyle, color: '#ef4444' }}>✕</button>
        </div>
      )}

      {/* Bannière session interrompue (mode ghost) */}
      {isGhost && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 12px', background: 'rgba(245,158,11,0.12)',
          borderBottom: '1px solid rgba(245,158,11,0.3)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 13 }}>⚠</span>
          <span style={{ fontSize: 12, color: '#f59e0b', flex: 1 }}>
            Session interrompue — buffer sauvegardé affiché en lecture seule
          </span>
          <button
            onClick={async () => {
              setResuming(true);
              try {
                await fetch(`/api/terminals/${terminalId}/resume`, { method: 'POST' });
                onResume?.();
              } catch {}
              setResuming(false);
            }}
            disabled={resuming}
            style={{
              background: resuming ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.2)',
              border: '1px solid rgba(245,158,11,0.5)',
              borderRadius: 5, color: '#f59e0b',
              padding: '3px 12px', cursor: resuming ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700, opacity: resuming ? 0.6 : 1,
            }}
          >
            {resuming ? '…' : '↺ Reprendre'}
          </button>
        </div>
      )}

      {/* Corps : les deux panneaux coexistent — display:none évite de détruire xterm */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Terminal xterm — toujours monté */}
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, display: activeTab === 'terminal' ? 'block' : 'none' }} />
        {/* Git Diff — monté au premier clic, puis persistant */}
        {diffEverOpened && (
          <div style={{ position: 'absolute', inset: 0, display: activeTab === 'diff' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
            <GitDiffPanel terminalId={terminalId} directory={terminalDirectory} onClose={null} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cellule vide dans la grille : invite a selectionner un terminal
 */
function EmptyCell({ index }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1a1b26', border: '1px dashed #2a2b3d', borderRadius: 4,
      color: '#565f89', fontSize: 13, flexDirection: 'column', gap: 6,
    }}>
      <span style={{ fontSize: 24, opacity: 0.3 }}>+</span>
      <span style={{ fontSize: 11 }}>Cellule {index + 1}</span>
      <span style={{ fontSize: 10, opacity: 0.5 }}>Cliquer un terminal dans la liste</span>
    </div>
  );
}

/**
 * Page Terminals — vue single ou grille multi-terminaux.
 */
export default function Terminals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [terminals, setTerminals]       = useState([]);
  const [activeTerminal, setActiveTerminal] = useState(null);
  const [available, setAvailable]       = useState(false);
  const [loading, setLoading]           = useState(true);
  const [editingListId, setEditingListId]     = useState(null);
  const [editingListName, setEditingListName] = useState('');

  // Mode grille
  const [gridMode, setGridMode]           = useState(false);
  const [layoutId, setLayoutId]           = useState('2x2');
  const [gridTerminals, setGridTerminals] = useState([]); // IDs ordonnés dans la grille

  const layout = LAYOUTS.find((l) => l.id === layoutId) || LAYOUTS[2];

  // Ouvrir un terminal via ?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      setActiveTerminal(openId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Formulaire de lancement
  const [directory, setDirectory]         = useState('');
  const [name, setName]                   = useState('');
  const [prompt, setPrompt]               = useState('');
  const [model, setModel]                 = useState('');
  const [dangerousMode, setDangerousMode] = useState(false);
  const [injectContext, setInjectContext] = useState(true);
  const [contextCount, setContextCount]   = useState(0);

  // Historique des répertoires (localStorage)
  const [dirHistory, setDirHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs:dir-history') || '[]'); } catch { return []; }
  });
  const [dirDropOpen, setDirDropOpen] = useState(false);
  const dirComboRef = useRef(null);

  const saveDirToHistory = (dir) => {
    if (!dir.trim()) return;
    const next = [dir.trim(), ...dirHistory.filter((d) => d !== dir.trim())].slice(0, 15);
    setDirHistory(next);
    localStorage.setItem('cs:dir-history', JSON.stringify(next));
  };

  const removeDirFromHistory = (dir) => {
    const next = dirHistory.filter((d) => d !== dir);
    setDirHistory(next);
    localStorage.setItem('cs:dir-history', JSON.stringify(next));
  };

  // Fermer le dropdown si clic en dehors
  useEffect(() => {
    const handler = (e) => {
      if (dirComboRef.current && !dirComboRef.current.contains(e.target)) {
        setDirDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Charger le nombre d'entrees de contexte partagé pour affichage dans le formulaire
  useEffect(() => {
    fetch('/api/context')
      .then((r) => r.json())
      .then((entries) => setContextCount(Array.isArray(entries) ? entries.filter((e) => !e.key.startsWith('squad:')).length : 0))
      .catch(() => {});
  }, []);

  const fetchTerminals = useCallback(async () => {
    try {
      const [terms, avail] = await Promise.all([
        fetch('/api/terminals').then((r) => r.json()),
        fetch('/api/terminals/available').then((r) => r.json()),
      ]);
      setTerminals(Array.isArray(terms) ? terms : []);
      setAvailable(avail.available);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTerminals();
    const t = setInterval(fetchTerminals, 3000);
    return () => clearInterval(t);
  }, [fetchTerminals]);

  const spawnTerminal = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory:     directory || undefined,
          name:          name || undefined,
          prompt:        prompt || undefined,
          model:         model || undefined,
          dangerousMode: dangerousMode || undefined,
          injectContext: injectContext,
        }),
      });
      const data = await res.json();
      if (data.terminalId) {
        if (gridMode) {
          addToGrid(data.terminalId);
        } else {
          setActiveTerminal(data.terminalId);
        }
        if (directory.trim()) saveDirToHistory(directory.trim());
        setDirectory(''); setName(''); setPrompt('');
        fetchTerminals();
      }
    } catch {}
  };

  const killTerminal = async (id) => {
    await fetch(`/api/terminals/${id}`, { method: 'DELETE' });
    if (activeTerminal === id) setActiveTerminal(null);
    setGridTerminals((prev) => prev.filter((tid) => tid !== id));
    fetchTerminals();
  };

  const cleanupTerminals = async () => {
    await fetch('/api/terminals/cleanup', { method: 'POST' });
    fetchTerminals();
  };

  const renameTerminal = async (id, newName) => {
    await fetch(`/api/terminals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    fetchTerminals();
  };

  // Gestion de la grille
  const addToGrid = (id) => {
    setGridTerminals((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id); // toggle off
      if (prev.length >= layout.max) {
        // Remplace le dernier slot
        return [...prev.slice(0, layout.max - 1), id];
      }
      return [...prev, id];
    });
  };

  const removeFromGrid = (id) => {
    setGridTerminals((prev) => prev.filter((t) => t !== id));
  };

  const handleTerminalClick = (id) => {
    if (gridMode) {
      addToGrid(id);
    } else {
      setActiveTerminal(id);
    }
  };

  // Quand on change de layout, tronquer si nécessaire
  const handleLayoutChange = (id) => {
    const l = LAYOUTS.find((x) => x.id === id);
    setLayoutId(id);
    if (l) setGridTerminals((prev) => prev.slice(0, l.max));
  };

  // Construire les cellules de la grille (slots fixes)
  const gridCells = Array.from({ length: layout.cols * layout.rows }, (_, i) => gridTerminals[i] || null);

  if (loading) return <div className="card" style={{ textAlign: 'center', padding: 32 }}>Chargement...</div>;

  return (
    <div style={{ height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Terminaux Claude Code</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!available && (
            <span style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: 6 }}>
              node-pty non disponible
            </span>
          )}
          {/* Toggle grille */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => { setGridMode(false); }}
              style={{
                padding: '4px 12px', borderRadius: '6px 0 0 6px', border: '1px solid var(--border)',
                background: !gridMode ? 'var(--accent)' : 'var(--bg-card)',
                color: !gridMode ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
              title="Vue simple"
            >
              ▣
            </button>
            <button
              onClick={() => { setGridMode(true); }}
              style={{
                padding: '4px 12px', borderRadius: '0 6px 6px 0', border: '1px solid var(--border)',
                borderLeft: 'none',
                background: gridMode ? 'var(--accent)' : 'var(--bg-card)',
                color: gridMode ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
              title="Vue grille"
            >
              ⊞ Grille
            </button>
          </div>
          {/* Sélecteur de layout (visible seulement en mode grille) */}
          {gridMode && (
            <div style={{ display: 'flex', gap: 4 }}>
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => handleLayoutChange(l.id)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: layoutId === l.id ? 'rgba(139,92,246,0.2)' : 'var(--bg-card)',
                    color: layoutId === l.id ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 12, fontWeight: layoutId === l.id ? 700 : 400,
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Corps principal */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12, flex: 1, minHeight: 0 }}>
        {/* Panneau gauche : formulaire + liste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
          {/* Formulaire de lancement */}
          <div className="card">
            <h3 style={{ marginBottom: 10, fontSize: 13 }}>Lancer un terminal</h3>
            <form onSubmit={spawnTerminal} style={{ display: 'grid', gap: 7 }}>
              {/* Répertoire — combobox avec historique */}
              <div ref={dirComboRef} style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <input
                    placeholder="Répertoire (ex: C:/mon-projet)"
                    value={directory}
                    onChange={(e) => { setDirectory(e.target.value); setDirDropOpen(true); }}
                    onFocus={() => dirHistory.length > 0 && setDirDropOpen(true)}
                    className="form-input"
                    style={{ paddingRight: 26 }}
                  />
                  {/* Chevron toggle */}
                  {dirHistory.length > 0 && (
                    <button type="button" onClick={() => setDirDropOpen((v) => !v)} style={{
                      position: 'absolute', right: 6, background: 'none', border: 'none',
                      color: '#565f89', cursor: 'pointer', padding: '0 2px', fontSize: 10, lineHeight: 1,
                    }}>
                      {dirDropOpen ? '▲' : '▼'}
                    </button>
                  )}
                </div>
                {/* Dropdown */}
                {dirDropOpen && dirHistory.length > 0 && (() => {
                  const q = directory.toLowerCase();
                  const filtered = dirHistory.filter((d) => !q || d.toLowerCase().includes(q));
                  if (!filtered.length) return null;
                  return (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: '#1f2335', border: '1px solid #3b4261', borderRadius: 6,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 2,
                      maxHeight: 220, overflowY: 'auto',
                    }}>
                      {filtered.map((d) => (
                        <div key={d} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #2a2b3d' }}>
                          <button type="button" onClick={() => { setDirectory(d); setDirDropOpen(false); }}
                            style={{
                              flex: 1, background: 'none', border: 'none', color: '#c0caf5',
                              cursor: 'pointer', padding: '7px 10px', textAlign: 'left',
                              fontSize: 11, fontFamily: 'monospace',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                            title={d}
                          >
                            <span style={{ color: '#565f89', marginRight: 4 }}>📁</span>
                            {d}
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeDirFromHistory(d); }}
                            style={{
                              background: 'none', border: 'none', color: '#565f89',
                              cursor: 'pointer', padding: '7px 8px', fontSize: 11,
                              flexShrink: 0, lineHeight: 1,
                            }}
                            title="Supprimer de l'historique"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <input placeholder="Nom (optionnel)" value={name} onChange={(e) => setName(e.target.value)} className="form-input" />
              <textarea placeholder="Prompt initial (optionnel)" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="form-input" rows={2} style={{ resize: 'vertical' }} />
              <select value={model} onChange={(e) => setModel(e.target.value)} className="form-input">
                <option value="">Modele par defaut</option>
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
                <option value="haiku">Haiku</option>
              </select>
              <label className="dangerous-label" title={`Ajoute automatiquement le Contexte Partagé au début du prompt initial de Claude.\n\nChaque entrée (clé: valeur) est injectée sous la forme :\n=== CONTEXTE PARTAGE ===\n- conventions/commits: feat:, fix:…\n- stack/node: v20 LTS\n========================\n\nCela permet à Claude de connaître les conventions du projet dès le démarrage, sans avoir à les répéter à la main.\n\n${contextCount > 0 ? `${contextCount} entrée${contextCount > 1 ? 's' : ''} actuellement dans le contexte.` : 'Aucune entrée dans le contexte partagé pour le moment.'}`}>
                <input type="checkbox" checked={injectContext} onChange={(e) => setInjectContext(e.target.checked)} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Injecter le contexte</span>
                <span className="dangerous-hint">
                  {contextCount > 0 ? `(${contextCount} entrée${contextCount > 1 ? 's' : ''})` : '(vide)'}
                </span>
              </label>
              <label className="dangerous-label">
                <input type="checkbox" checked={dangerousMode} onChange={(e) => setDangerousMode(e.target.checked)} />
                <span className="dangerous-text">Mode dangereux</span>
                <span className="dangerous-hint">(skip permissions)</span>
              </label>
              <button type="submit" className="btn btn-primary" disabled={!available}>
                Lancer Claude Code
              </button>
            </form>
          </div>

          {/* Liste des terminaux */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: 13, margin: 0 }}>
                Terminaux ({terminals.length})
                {gridMode && gridTerminals.length > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)' }}>{gridTerminals.length}/{layout.max} affichés</span>
                )}
              </h3>
              {terminals.some((t) => t.status !== 'running') && (
                <button onClick={cleanupTerminals} className="cleanup-btn" title="Supprimer les terminaux termines">
                  Nettoyer
                </button>
              )}
            </div>

            {terminals.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                Aucun terminal
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 5 }}>
                {terminals.map((t) => {
                  const isActive   = !gridMode && activeTerminal === t.id;
                  const inGrid     = gridMode && gridTerminals.includes(t.id);
                  const gridIndex  = gridTerminals.indexOf(t.id);
                  const isGhostT   = t.status === 'ghost';
                  const statusColor = t.status === 'running' ? '#22c55e' : isGhostT ? '#f59e0b' : '#ef4444';

                  return (
                    <div
                      key={t.id}
                      className="card terminal-card"
                      style={{
                        padding: '8px 10px',
                        cursor: 'pointer',
                        border: isActive || inGrid ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderLeft: `3px solid ${statusColor}`,
                        opacity: gridMode && gridTerminals.length >= layout.max && !inGrid ? 0.5 : 1,
                      }}
                      onClick={() => handleTerminalClick(t.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        {editingListId === t.id ? (
                          <form
                            onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (editingListName.trim()) renameTerminal(t.id, editingListName.trim()); setEditingListId(null); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ flex: 1, marginRight: 8 }}
                          >
                            <input value={editingListName} onChange={(e) => setEditingListName(e.target.value)} autoFocus
                              onBlur={() => { if (editingListName.trim()) renameTerminal(t.id, editingListName.trim()); setEditingListId(null); }}
                              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, width: '100%', boxSizing: 'border-box' }}
                            />
                          </form>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            {/* Badge numéro de cellule en mode grille */}
                            {inGrid && (
                              <span style={{ fontSize: 10, background: 'var(--accent)', color: 'white', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                                {gridIndex + 1}
                              </span>
                            )}
                            <span
                              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              onDoubleClick={(e) => { e.stopPropagation(); setEditingListId(t.id); setEditingListName(t.name); }}
                              title="Double-cliquer pour renommer"
                            >
                              {t.name}
                            </span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                          <span style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 8,
                            background: t.status === 'running' ? 'rgba(34,197,94,0.15)' : isGhostT ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            color: statusColor,
                            fontWeight: 700, textTransform: 'uppercase',
                          }}>
                            {isGhostT ? 'interrompu' : t.status}
                          </span>
                          {t.status === 'running' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); killTerminal(t.id); }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
                              title="Arreter"
                            >
                              ×
                            </button>
                          )}
                          {isGhostT && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await fetch(`/api/terminals/${t.id}/resume`, { method: 'POST' });
                                fetchTerminals();
                              }}
                              style={{ background: 'none', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 3, color: '#f59e0b', cursor: 'pointer', fontSize: 11, padding: '1px 6px', lineHeight: 1 }}
                              title="Reprendre la session"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.directory}>
                        {t.directory}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Panneau droit : vue simple ou grille */}
        {gridMode ? (
          // ---- Mode grille ----
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
            gridTemplateRows:    `repeat(${layout.rows}, 1fr)`,
            gap: 4,
            minHeight: 0,
          }}>
            {gridCells.map((termId, i) => {
              if (!termId) return <EmptyCell key={i} index={i} />;
              const t = terminals.find((x) => x.id === termId);
              return (
                <div key={termId} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#1a1b26', minHeight: 0 }}>
                  <TerminalView
                    key={`${termId}-${t?.status}`}
                    terminalId={termId}
                    terminalName={t?.name}
                    terminalDirectory={t?.directory}
                    terminalStatus={t?.status}
                    onClose={() => removeFromGrid(termId)}
                    onRename={renameTerminal}
                    onResume={fetchTerminals}
                    compact={layout.cols > 1 || layout.rows > 2}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          // ---- Mode simple ----
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#1a1b26', minHeight: 400 }}>
            {activeTerminal ? (
              <TerminalView
                key={`${activeTerminal}-${terminals.find((t) => t.id === activeTerminal)?.status}`}
                terminalId={activeTerminal}
                terminalName={terminals.find((t) => t.id === activeTerminal)?.name}
                terminalDirectory={terminals.find((t) => t.id === activeTerminal)?.directory}
                terminalStatus={terminals.find((t) => t.id === activeTerminal)?.status}
                onClose={() => setActiveTerminal(null)}
                onRename={renameTerminal}
                onResume={fetchTerminals}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#565f89', fontSize: 14 }}>
                Selectionnez ou lancez un terminal
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .form-input { padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 13px; width: 100%; box-sizing: border-box; }
        .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { background: var(--accent); color: white; }
        .dangerous-label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .dangerous-text { font-size: 13px; color: var(--error, #ef4444); font-weight: 600; }
        .dangerous-hint { font-size: 11px; color: var(--text-secondary); }
        .cleanup-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer; color: var(--text-secondary); }
        .cleanup-btn:hover { background: rgba(239,68,68,0.1); color: var(--error, #ef4444); border-color: var(--error, #ef4444); }
        @keyframes ws-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
      `}</style>
    </div>
  );
}

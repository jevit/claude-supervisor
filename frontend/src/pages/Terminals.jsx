import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import 'xterm/css/xterm.css';
import GitDiffPanel from '../components/GitDiffPanel';
import ComboBox, { useComboHistory } from '../components/ComboBox';
import { useWebSocket } from '../services/websocket';

// Supprime les séquences ANSI pour prévisualiser le texte terminal brut
const stripAnsi = (s) => s
  .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  .replace(/\x1b\][^\x07]*\x07/g, '')
  .replace(/\r/g, '');

// Patterns indiquant qu'un terminal attend une confirmation utilisateur
const WAITING_PATTERNS = /y\/n|allow\?|proceed\?|continue\?|overwrite\?|confirm|do you want|press enter|press any key|stdin|waiting for|permission denied.*\?/i;

// Sparkline SVG — 12 buckets × 5s = 60s d'activité rolling
function Sparkline({ buckets }) {
  const max = Math.max(...buckets, 1);
  return (
    <svg width={48} height={14} style={{ display: 'block', flexShrink: 0 }}>
      {buckets.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * 12));
        return <rect key={i} x={i * 4} y={14 - h} width={3} height={h} fill={v > 0 ? '#8b5cf6' : '#2d3148'} rx={1} />;
      })}
    </svg>
  );
}

// Layouts disponibles en mode grille
const LAYOUTS = [
  { id: '1x2', cols: 1, rows: 2, label: '1×2', max: 2 },
  { id: '2x1', cols: 2, rows: 1, label: '2×1', max: 2 },
  { id: '2x2', cols: 2, rows: 2, label: '2×2', max: 4 },
  { id: '2x3', cols: 2, rows: 3, label: '2×3', max: 6 },
];

// Formate un timestamp en temps relatif (ex: "il y a 2min")
function fmtRelative(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 5)   return 'à l\'instant';
  if (s < 60)  return `il y a ${s}s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)}min`;
  return `il y a ${Math.floor(s / 3600)}h`;
}

/**
 * Panneau de l'onglet Agents — liste les subagents invoqués par la session.
 * agents: [{type, count, lastUsedAt, calls: [{description, timestamp}]}]
 */
function AgentsPanel({ agents }) {
  const [expanded, setExpanded] = useState({});
  const [tick, setTick] = useState(0);

  // Rafraîchir les timestamps relatifs toutes les 10s
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const totalCalls = agents.reduce((s, a) => s + a.count, 0);

  if (agents.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#565f89' }}>
        <span style={{ fontSize: 13 }}>Aucun agent invoqué pour l'instant</span>
        <span style={{ fontSize: 11, color: '#3d4063' }}>Les agents apparaîtront ici dès qu'une tâche sera déléguée.</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
      {/* En-tête */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#565f89', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Agents invoqués
        </span>
        <span style={{ fontSize: 11, color: '#3d4063', marginLeft: 8 }}>
          {totalCalls} appel{totalCalls !== 1 ? 's' : ''} • {agents.length} type{agents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Liste des agents, triés par count décroissant */}
      {[...agents].sort((a, b) => b.count - a.count).map((agent) => {
        const isOpen = expanded[agent.type];
        const proportion = totalCalls > 0 ? agent.count / totalCalls : 0;
        return (
          <div key={agent.type} style={{ borderBottom: '1px solid #2a2b3d', paddingBottom: 6, marginBottom: 6 }}>
            {/* Ligne principale — cliquable pour déplier */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpanded((p) => ({ ...p, [agent.type]: !p[agent.type] }))}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((p) => ({ ...p, [agent.type]: !p[agent.type] })); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 4px', borderRadius: 4, outline: 'none' }}
              title={`${agent.type} — ${agent.count} appel${agent.count !== 1 ? 's' : ''}, dernier ${fmtRelative(agent.lastUsedAt)}`}
            >
              <span style={{ fontSize: 10, color: '#565f89', width: 10, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#8b5cf6', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.type.length > 24 ? agent.type.substring(0, 24) + '…' : agent.type}
              </span>
              {/* Barre de proportion */}
              <svg width={60} height={6} style={{ flexShrink: 0 }}
                title={`${agent.type} : ${agent.count} appels sur ${totalCalls} (${Math.round(proportion * 100)}%)`}>
                <rect x={0} y={0} width={60} height={6} rx={3} fill="#2d3148" />
                <rect x={0} y={0} width={Math.max(4, Math.round(proportion * 60))} height={6} rx={3} fill="#8b5cf6" />
              </svg>
              <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: '#a9b1d6', fontWeight: 700, flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
                ×{agent.count}
              </span>
              <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                {fmtRelative(agent.lastUsedAt)}
              </span>
            </div>
            {/* Description de la dernière invocation */}
            {!isOpen && agent.calls.length > 0 && (
              <p style={{ margin: '0 0 0 22px', fontSize: 11, color: '#565f89', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.calls[agent.calls.length - 1].description || '—'}
              </p>
            )}
            {/* Historique des appels (déplié) */}
            {isOpen && (
              <div style={{ margin: '4px 0 0 22px', maxHeight: 180, overflowY: 'auto' }} role="list">
                {[...agent.calls].reverse().map((call, i) => (
                  <div key={i} role="listitem" style={{ display: 'flex', gap: 8, padding: '3px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, marginBottom: 3 }}
                    title={new Date(call.timestamp).toLocaleString()}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b', flexShrink: 0 }}>
                      {new Date(call.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span style={{ fontSize: 11, color: '#a9b1d6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {call.description || '—'}
                    </span>
                  </div>
                ))}
                {agent.calls.length === 50 && (
                  <div style={{ fontSize: 10, color: '#3d4063', textAlign: 'center', padding: '4px 0' }}>
                    50 appels max affichés
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Composant d'un terminal individuel avec xterm.js.
 * Gère le replay du buffer au montage et à chaque reconnexion WS.
 * En mode ghost (session interrompue), affiche le buffer sauvegardé + bannière de reprise.
 */
function TerminalView({ terminalId, terminalName, terminalDirectory, terminalStatus, onClose, onRename, onResume, onZoom, compact = false, isWaiting = false, terminalAgents = [] }) {
  const containerRef   = useRef(null);
  const xtermRef       = useRef(null);
  const fitAddonRef    = useRef(null);
  const searchAddonRef = useRef(null);
  const wsRef          = useRef(null);
  const destroyedRef   = useRef(false);
  const reconnTimerRef = useRef(null);
  const searchInputRef = useRef(null);
  const isReplayingRef = useRef(false);  // vrai pendant replayBuffer — supprime les écritures WS
  const wsMsgQueueRef  = useRef([]);     // messages WS reçus pendant le replay, à flusher après

  const isGhost = terminalStatus === 'ghost';
  const [resuming,          setResuming]          = useState(false);

  // Supprime l'erreur interne d'xterm.js "dimensions" après dispose()
  // (Viewport._innerRefresh planifié en rAF s'exécute après xterm.dispose())
  useEffect(() => {
    const handler = (e) => {
      if (e.message?.includes('dimensions') && e.filename?.includes('xterm')) {
        e.preventDefault();
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  const [editing,           setEditing]           = useState(false);
  const [editName,          setEditName]          = useState(terminalName || '');
  const [activeTab,         setActiveTab]         = useState('terminal'); // 'terminal' | 'diff' | 'agents'
  const [diffEverOpened,    setDiffEverOpened]    = useState(false);
  const [agentsEverOpened,  setAgentsEverOpened]  = useState(false);
  const [replaying,         setReplaying]         = useState(false);
  const [diffFileCount,     setDiffFileCount]     = useState(0); // badge sur l'onglet diff
  const [confirmClose,      setConfirmClose]      = useState(false); // confirmation inline (#3)

  // Vérifier le nb de fichiers modifiés pour le badge diff (toutes les 15s)
  useEffect(() => {
    if (!terminalId || isGhost) return;
    const check = async () => {
      try {
        const res = await fetch(`/api/terminals/${terminalId}/diff`);
        if (res.ok) { const d = await res.json(); setDiffFileCount(d.files?.length || 0); }
      } catch {}
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [terminalId, isGhost]);

  const switchTab = (tab) => {
    if (tab === 'diff') setDiffEverOpened(true);
    if (tab === 'agents') setAgentsEverOpened(true);
    setActiveTab(tab);
  };

  // Écouter l'event custom pour ouvrir l'onglet Agents depuis un chip dans la liste
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.terminalId === terminalId) switchTab('agents');
    };
    window.addEventListener('cs:open-agents-tab', handler);
    return () => window.removeEventListener('cs:open-agents-tab', handler);
  }, [terminalId]);
  const autoScrollRef      = useRef(true);
  const [autoScroll,        setAutoScroll]        = useState(true);
  const [newLinesPending,   setNewLinesPending]   = useState(0);

  const [wsStatus,    setWsStatus]    = useState('connecting');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase,   setMatchCase]   = useState(false);
  const [matchInfo,   setMatchInfo]   = useState(null); // { current, total } | null

  useEffect(() => {
    if (!containerRef.current || !terminalId) return;
    // Variable locale à CETTE instance d'effet — immune aux race conditions StrictMode
    // (destroyedRef partagé causait des interférences entre mount1 et mount2)
    let destroyed = false;
    destroyedRef.current   = false;
    isReplayingRef.current = false; // reset en cas de double-mount StrictMode
    wsMsgQueueRef.current  = [];

    /* ── Initialisation xterm ─────────────────────────────────── */
    const xterm = new XTerm({
      allowProposedApi: true, // requis par SearchAddon pour registerDecoration
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
    // Double rAF : attendre le paint initial pour fit + focus
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { if (xterm.element) fitAddon.fit(); } catch {}
      if (!destroyed && !isGhost) xterm.focus();
    }));
    // Passages supplémentaires pour absorber les délais de layout flex/grid
    const fit100 = setTimeout(() => { if (!destroyed && xterm.element) { try { fitAddon.fit(); } catch {} } }, 100);
    const fit400 = setTimeout(() => { if (!destroyed && xterm.element) { try { fitAddon.fit(); } catch {} } }, 400);
    const fit1000 = setTimeout(() => { if (!destroyed && xterm.element) { try { fitAddon.fit(); } catch {} } }, 1000);
    const initFitTimer = { fit100, fit400, fit1000 }; // regroupé pour le cleanup

    xtermRef.current       = xterm;
    fitAddonRef.current    = fitAddon;
    searchAddonRef.current = searchAddon;

    // Nombre de résultats de recherche (#9)
    searchAddon.onResultsChanged?.((results) => {
      if (results?.resultCount > 0) {
        setMatchInfo({ found: true, current: (results.resultIndex ?? 0) + 1, total: results.resultCount });
      } else if (results) {
        setMatchInfo({ found: false });
      }
    });

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

    /* ── Désactivation auto-scroll sur scroll manuel (#10) ────── */
    xterm.onScroll((ydisp) => {
      const totalLines = xterm.buffer.active.length;
      const isAtBottom = ydisp + xterm.rows >= totalLines - 1;
      if (!isAtBottom && autoScrollRef.current) {
        autoScrollRef.current = false;
        setAutoScroll(false);
      }
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

    /* ── Resize (debounce 50ms pour éviter les appels intempestifs) ── */
    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(() => {
      if (destroyed || !xterm.element) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (destroyed || !xterm.element) return;
        try { fitAddon.fit(); } catch {}
        fetch(`/api/terminals/${terminalId}/resize`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cols: xterm.cols, rows: xterm.rows }),
        }).catch(() => {});
      }, 50);
    });
    resizeObserver.observe(containerRef.current);

    /* ── Replay du buffer ─────────────────────────────────────── */
    // Le ⏳ est affiché en overlay React (pas dans xterm) pour ne pas polluer le buffer terminal.
    // Écrire du texte dans xterm avant que Claude Code démarre corrompait le curseur et bloquait
    // l'entrée utilisateur (conflit avec les séquences ANSI d'initialisation de Claude Code).
    const replayBuffer = async () => {
      if (destroyed) return; // variable locale — immunisé contre le double-mount StrictMode
      if (isReplayingRef.current) return; // éviter les replays concurrents
      isReplayingRef.current = true;
      wsMsgQueueRef.current  = [];
      setReplaying(true);

      // fit() avant reset() pour que xterm connaisse ses dimensions réelles dès le départ
      // (sans ça, reset() opère à 80×24 par défaut et le canvas n'est pas à la bonne taille)
      try { fitAddon.fit(); } catch {}
      try { xterm.reset(); } catch {}

      try {
        const res  = await fetch(`/api/terminals/${terminalId}/output?last=50000`);
        const data = await res.json();
        if (!destroyed && data.output) {
          xterm.write(data.output);
          xterm.scrollToBottom();
        }
      } catch {}

      // Guard crucial contre la double-exécution StrictMode :
      // sans ce guard, le replayBuffer du mount1 (destroyed=true) écrase isReplayingRef
      // et vole la queue du mount2 via splice() alors que mount2 est encore en cours de replay.
      if (!destroyed) {
        isReplayingRef.current = false;
        const queued = wsMsgQueueRef.current.splice(0);
        try {
          // Toujours flusher les msgs WS mis en queue (peuvent contenir des séquences
          // critiques comme \x1b[?1049h switch alt-screen)
          queued.forEach((d) => xterm.write(d));
          xterm.scrollToBottom();
        } catch {}
        setReplaying(false);
        try { fitAddon.fit(); } catch {}
        setTimeout(() => { if (!destroyed) try { fitAddon.fit(); } catch {} }, 150);
      }
    };

    /* ── WebSocket avec reconnexion automatique ───────────────── */
    // IMPORTANT : utiliser /ws pour que Vite proxy redirige vers le backend (:3001).
    // ws://localhost:3000 (racine) = WebSocket HMR de Vite → aucun terminal:output reçu.
    // ws://localhost:3000/ws       = proxy vers backend → reçoit tous les events ✓
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
    let reconnectDelay = 1000;

    const connect = () => {
      if (destroyed) return;
      // Fermer proprement l'ancienne connexion si elle existe (StrictMode double-mount)
      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      setWsStatus('connecting');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyed) { ws.close(); return; }
        reconnectDelay = 1000; // reset le backoff
        setWsStatus('open');
        // S'abonner uniquement à ce terminal pour réduire le trafic WS (surtout en mode grille)
        ws.send(JSON.stringify({ type: 'subscribe', data: { terminalId } }));
        // Re-rejoue le buffer pour combler les trous pendant la déconnexion
        replayBuffer();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'terminal:output' && msg.data?.terminalId === terminalId) {
            if (isReplayingRef.current) {
              // File d'attente pendant le replay pour éviter les conflits avec xterm.reset()
              wsMsgQueueRef.current.push(msg.data.data);
            } else if (!destroyed) {
              try {
                xterm.write(msg.data.data);
                if (autoScrollRef.current) {
                  xterm.scrollToBottom();
                } else {
                  // Compter les lignes en attente quand le scroll est bloqué
                  setNewLinesPending((n) => n + (msg.data.data.match(/\n/g)?.length || 0));
                }
              } catch {}
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (destroyed) return;
        setWsStatus('closed');
        // Reconnexion avec backoff exponentiel (max 10s)
        reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        reconnTimerRef.current = setTimeout(connect, reconnectDelay);
      };
    };

    const clearInitTimers = () => {
      clearTimeout(initFitTimer.fit100);
      clearTimeout(initFitTimer.fit400);
      clearTimeout(initFitTimer.fit1000);
    };

    // En mode ghost : replay du buffer uniquement, pas de WS live
    if (isGhost) {
      replayBuffer();
      return () => {
        destroyed = true;
        destroyedRef.current = true;
        clearInitTimers();
        try { resizeObserver.disconnect(); } catch {}
        try { fitAddon.dispose(); } catch {}
        xterm.dispose();
      };
    }

    connect(); // connexion initiale

    // Replay immédiat : ne pas laisser l'écran noir pendant la connexion WS (~300ms)
    // Le WS relancera un replay à son ouverture pour combler les trous
    replayBuffer();

    return () => {
      destroyed = true;
      destroyedRef.current = true;
      clearInitTimers();
      clearTimeout(reconnTimerRef.current);
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      wsRef.current?.close();
      // Disposer fitAddon avant xterm pour éviter l'erreur "dimensions" interne
      try { fitAddon.dispose(); } catch {}
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
    if (activeTab === 'terminal' && fitAddonRef.current && xtermRef.current?.element) {
      requestAnimationFrame(() => { try { if (xtermRef.current?.element) fitAddonRef.current?.fit(); } catch {} });
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

  const toggleAutoScroll = () => {
    const next = !autoScrollRef.current;
    autoScrollRef.current = next;
    setAutoScroll(next);
    if (next) {
      setNewLinesPending(0);
      xtermRef.current?.scrollToBottom();
    }
  };

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
          {/* Badge d'attente de confirmation (#8) */}
          {isWaiting && (
            <span
              title="Terminal en attente de confirmation (y/N)"
              style={{
                fontSize: compact ? 9 : 10, padding: '1px 5px', borderRadius: 6,
                background: 'rgba(139,92,246,0.2)', color: '#8b5cf6',
                border: '1px solid rgba(139,92,246,0.4)', fontWeight: 700,
                animation: 'waiting-pulse 1.2s ease-in-out infinite', flexShrink: 0,
              }}
            >
              ⚠ attend
            </span>
          )}
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); if (editName.trim()) { onRename(terminalId, editName.trim()); setEditing(false); } }} style={{ display: 'flex' }}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                onBlur={() => { if (editName.trim()) onRename(terminalId, editName.trim()); setEditing(false); }}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 6px', color: '#c0caf5', fontSize: compact ? 10 : 12, fontFamily: 'monospace', width: 130 }}
              />
            </form>
          ) : (
            <span
              onDoubleClick={() => setEditing(true)}
              title="Double-cliquer pour renommer"
              className="terminal-name-editable"
              style={{ fontSize: compact ? 10 : 12, color: '#c0caf5', fontFamily: 'monospace', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {terminalName || `Terminal ${terminalId?.substring(0, 8)}`}
              <span className="rename-hint" onClick={() => setEditing(true)} title="Renommer" style={{ opacity: 0, fontSize: 10, cursor: 'pointer', flexShrink: 0 }}>✏</span>
            </span>
          )}
        </div>

        {/* Centre : onglets >_ Terminal | ⎇ Git Diff | ⬡ Agents */}
        <div style={{ display: 'flex', flexShrink: 0, border: '1px solid #2a2b3d', borderRadius: 5, overflow: 'hidden' }}>
          {[
            { id: 'terminal', label: compact ? '>_' : '>_ Terminal' },
            { id: 'diff',     label: compact ? '⎇'  : '⎇ Git Diff', count: diffFileCount },
            ...(terminalAgents.length > 0 || agentsEverOpened
              ? [{ id: 'agents', label: compact ? '⬡' : '⬡ Agents', count: terminalAgents.reduce((s, a) => s + a.count, 0) }]
              : []),
          ].map((tab) => (
            <button key={tab.id} onClick={() => switchTab(tab.id)} style={{
              background: activeTab === tab.id ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: activeTab === tab.id ? '#c0caf5' : '#565f89',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #8b5cf6' : '2px solid transparent',
              borderRight: tab.id !== 'agents' && tab.id !== 'diff' ? '1px solid #2a2b3d' : tab.id === 'diff' && terminalAgents.length > 0 ? '1px solid #2a2b3d' : 'none',
              padding: compact ? '0 7px' : '0 11px',
              height: '100%', cursor: 'pointer',
              fontSize: compact ? 10 : 11,
              fontFamily: 'monospace', fontWeight: activeTab === tab.id ? 700 : 400,
              transition: 'background 0.15s, color 0.15s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  background: activeTab === tab.id ? '#8b5cf6' : 'rgba(139,92,246,0.5)',
                  color: 'white', borderRadius: 8,
                  fontSize: 9, fontWeight: 700, fontFamily: 'sans-serif',
                  padding: '1px 5px', lineHeight: 1.4,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Droite : recherche + fermer */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={async () => {
              try {
                const res  = await fetch(`/api/terminals/${terminalId}/output?last=999999`);
                const data = await res.json();
                const text = stripAnsi(data.output || '');
                const blob = new Blob([text], { type: 'text/plain' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `${terminalName || terminalId}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              } catch {}
            }}
            title="Exporter le buffer en .txt"
            style={{
              background: 'none', color: '#a9b1d6', border: '1px solid var(--border)', borderRadius: 4,
              padding: compact ? '1px 5px' : '2px 7px', cursor: 'pointer', fontSize: compact ? 9 : 11,
            }}
          >
            {compact ? '↓' : '↓ Export'}
          </button>
          <button onClick={() => setSearchOpen((v) => !v)} title="Rechercher (Ctrl+F)" style={{
            background: searchOpen ? 'rgba(139,92,246,0.25)' : 'none',
            color: searchOpen ? '#8b5cf6' : '#c0caf5',
            border: '1px solid var(--border)', borderRadius: 4,
            padding: compact ? '1px 5px' : '2px 7px',
            cursor: 'pointer', fontSize: compact ? 10 : 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            🔍{!compact && <kbd style={{ fontSize: 9, opacity: 0.5, fontFamily: 'monospace', background: 'rgba(255,255,255,0.08)', borderRadius: 3, padding: '1px 3px' }}>^F</kbd>}
          </button>
          <button
            onClick={() => {
              if (!xtermRef.current) return;
              xtermRef.current.selectAll();
              navigator.clipboard.writeText(xtermRef.current.getSelection()).then(() => {
                xtermRef.current.clearSelection?.();
              }).catch(() => {});
            }}
            title="Copier tout le buffer"
            style={{
              background: 'none', color: '#a9b1d6', border: '1px solid var(--border)', borderRadius: 4,
              padding: compact ? '1px 5px' : '2px 7px', cursor: 'pointer', fontSize: compact ? 9 : 11,
            }}
          >
            {compact ? '⎘' : '⎘ Buffer'}
          </button>
          <button
            onClick={toggleAutoScroll}
            title={autoScroll ? 'Bloquer le scroll (⏸)' : 'Reprendre le scroll automatique'}
            style={{
              background: autoScroll ? 'none' : 'rgba(139,92,246,0.2)',
              color: autoScroll ? '#a9b1d6' : '#8b5cf6',
              border: `1px solid ${autoScroll ? 'var(--border)' : 'rgba(139,92,246,0.5)'}`,
              borderRadius: 4, padding: compact ? '1px 5px' : '2px 7px',
              cursor: 'pointer', fontSize: compact ? 9 : 11, fontVariantNumeric: 'tabular-nums',
              minWidth: compact ? undefined : 36, textAlign: 'center',
            }}
          >
            {!autoScroll && newLinesPending > 0 ? `▼${newLinesPending}` : autoScroll ? '⏸' : '▼'}
          </button>
          {onZoom && (
            <button onClick={onZoom} title="Zoom (double-clic)" style={{
              background: 'none', color: '#a9b1d6', border: '1px solid var(--border)', borderRadius: 4,
              padding: compact ? '1px 5px' : '2px 7px', cursor: 'pointer', fontSize: compact ? 10 : 12,
            }}>⤢</button>
          )}
          {terminalDirectory && !compact && (
            <a
              href={`vscode://file/${terminalDirectory.replace(/\\/g, '/')}`}
              title={`Ouvrir dans VS Code : ${terminalDirectory}`}
              style={{ background: 'none', color: '#a9b1d6', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 11, textDecoration: 'none', lineHeight: 1.5 }}
            >
              ⎈
            </a>
          )}
          {/* Confirmation inline de fermeture (#3) */}
          {confirmClose ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '2px 6px' }}>
              <span style={{ fontSize: 10, color: '#ef4444', whiteSpace: 'nowrap' }}>Fermer ?</span>
              <button onClick={onClose} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>Oui</button>
              <button onClick={() => setConfirmClose(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontSize: 10, color: 'var(--text-secondary)' }}>Non</button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (terminalStatus === 'running') { setConfirmClose(true); return; }
                onClose();
              }}
              style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, padding: compact ? '1px 6px' : '2px 10px', cursor: 'pointer', fontSize: compact ? 10 : 11 }}
            >×</button>
          )}
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
          {/* Résultat (#9) */}
          {searchQuery && (
            <span style={{ fontSize: 11, color: matchInfo?.found === false ? '#ef4444' : '#a9b1d6', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {matchInfo?.found === false
                ? 'Aucun résultat'
                : matchInfo?.total
                  ? `${matchInfo.current}/${matchInfo.total}`
                  : ''}
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

      {/* Corps : panneaux coexistants — display:none évite de détruire xterm */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Terminal xterm — toujours monté */}
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, display: activeTab === 'terminal' ? 'block' : 'none' }} />
        {/* Indicateur de démarrage — transparent pour ne pas masquer le contenu xterm */}
        {replaying && activeTab === 'terminal' && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            zIndex: 5, background: 'rgba(26,27,38,0.85)', borderRadius: 6,
            padding: '4px 12px', fontSize: 12, color: '#565f89',
            display: 'flex', alignItems: 'center', gap: 6,
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            <span style={{ animation: 'ws-blink 1s ease-in-out infinite' }}>⏳</span>
            Démarrage…
          </div>
        )}
        {/* Git Diff — monté au premier clic, puis persistant */}
        {diffEverOpened && (
          <div style={{ position: 'absolute', inset: 0, display: activeTab === 'diff' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
            <GitDiffPanel terminalId={terminalId} directory={terminalDirectory} onClose={null} />
          </div>
        )}
        {/* Agents — panneau temps réel */}
        {agentsEverOpened && (
          <div style={{ position: 'absolute', inset: 0, display: activeTab === 'agents' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', background: '#1a1b26' }}>
            <AgentsPanel agents={terminalAgents} />
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
  const terminalsRef                    = useRef([]);
  const [activeTerminal, setActiveTerminal] = useState(null);
  const [available, setAvailable]       = useState(false);
  const [loading, setLoading]           = useState(true);
  const [editingListId, setEditingListId]     = useState(null);
  const [editingListName, setEditingListName] = useState('');

  // Mode grille — persisté dans localStorage
  const [gridMode, setGridMode]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs:grid-mode') || 'false'); } catch { return false; }
  });
  const [layoutId, setLayoutId]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs:grid-layout') || '{}').layoutId || '2x2'; } catch { return '2x2'; }
  });
  const [gridTerminals, setGridTerminals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs:grid-layout') || '{}').gridTerminals || []; } catch { return []; }
  });
  const [focusedTerminal, setFocusedTerminal] = useState(null); // zoom plein écran en mode grille

  // Supervision temps réel
  const [lastActivity, setLastActivity]       = useState({}); // terminalId → timestamp ms
  const [silenceTick, setSilenceTick]         = useState(0); // force re-render pour les badges de silence
  const [branchColors, setBranchColors]       = useState({}); // terminalId → couleur hex CSS
  const [gridFocusIdx, setGridFocusIdx]       = useState(null); // index cellule focalisée en grille
  const [selectedIds, setSelectedIds]         = useState(new Set()); // sélection multiple

  // Filtres liste
  const [listFilter, setListFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState(null); // null | 'running' | 'ghost' | 'stopped'

  // Épinglés (persistés)
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cs:pinned-terminals') || '[]')); } catch { return new Set(); }
  });

  // Conflits + activité sparkline + attente
  const [conflictSet, setConflictSet]         = useState(new Set()); // terminalIds avec fichiers en conflit
  const [activityBuckets, setActivityBuckets] = useState({}); // terminalId → [12 buckets 5s]
  const [waitingSet, setWaitingSet]           = useState(new Set()); // terminalIds en attente de confirmation
  // Agents subagents : terminalId → { agentType: { count, lastUsedAt, calls[] } }
  const [agentCallsMap, setAgentCallsMap]     = useState({});

  // Navigation clavier dans la liste
  const [listFocusIdx, setListFocusIdx]       = useState(null);
  const terminalListRef                       = useRef(null);

  // Broadcast
  const [broadcastCmd, setBroadcastCmd] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  const layout = LAYOUTS.find((l) => l.id === layoutId) || LAYOUTS[2];

  // Garder terminalsRef à jour pour les callbacks stale (useCallback avec deps vides)
  useEffect(() => { terminalsRef.current = terminals; }, [terminals]);

  // Demander la permission notifications navigateur au montage (#27)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Persistance grille layout
  useEffect(() => {
    localStorage.setItem('cs:grid-mode', JSON.stringify(gridMode));
  }, [gridMode]);
  useEffect(() => {
    localStorage.setItem('cs:grid-layout', JSON.stringify({ layoutId, gridTerminals }));
  }, [layoutId, gridTerminals]);

  // Persistance épinglés
  useEffect(() => {
    localStorage.setItem('cs:pinned-terminals', JSON.stringify([...pinnedIds]));
  }, [pinnedIds]);

  // Ouvrir un terminal via ?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      setActiveTerminal(openId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Focuser le formulaire via ?create=1 (Alt+T depuis n'importe quelle page) (#1)
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setSearchParams({}, { replace: true });
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const firstInput = formRef.current?.querySelector('input');
        if (firstInput) firstInput.focus();
      }, 100);
    }
  }, [searchParams, setSearchParams]);

  // Ref sur le formulaire pour le focus via Alt+T (#1)
  const formRef = useRef(null);

  // Formulaire de lancement — répertoire pré-rempli avec le dernier utilisé
  const dirComboHistory  = useComboHistory('cs:dir-history');
  const nameComboHistory = useComboHistory('cs:name-history');

  const [directory, setDirectory]         = useState(() => dirComboHistory.history[0] || '');
  const [name, setName]                   = useState('');
  const [prompt, setPrompt]               = useState('');
  const [model, setModel]                 = useState('');
  const [dangerousMode, setDangerousMode] = useState(false);
  const [injectContext, setInjectContext] = useState(true);
  const [resumeSessionId, setResumeSessionId] = useState(''); // #83
  const [contextCount, setContextCount]   = useState(0);
  const [showAdvanced, setShowAdvanced]   = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(() => localStorage.getItem('cs:form-collapsed') === '1');
  const [spawnError, setSpawnError]       = useState(null);
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs:term-templates') || '[]'); } catch { return []; }
  });

  // Charger le nombre d'entrees de contexte partagé pour affichage dans le formulaire
  useEffect(() => {
    fetch('/api/context')
      .then((r) => r.json())
      .then((entries) => setContextCount(Array.isArray(entries) ? entries.filter((e) => !e.key.startsWith('squad:')).length : 0))
      .catch(() => {});
  }, []);

  // Couleur dérivée du nom de branche git (hue stable par hash du nom)
  const branchHue = (name) => {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFF;
    return h % 360;
  };

  // Fetch branches via git/all-changes pour colorier les cartes + détecter conflits
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/git/all-changes');
        if (!res.ok) return;
        const { terminals: data, hotFiles } = await res.json();
        // Branch colors
        const map = {};
        (data || []).forEach((t) => {
          if (t.currentBranch) {
            const hue = branchHue(t.currentBranch);
            map[t.id] = `hsl(${hue},60%,55%)`;
          }
        });
        setBranchColors(map);
        // Conflict set : terminaux qui touchent des hotFiles
        if (hotFiles && hotFiles.length > 0) {
          const hotSet = new Set(hotFiles);
          const conflicting = new Set();
          (data || []).forEach((t) => {
            const files = (t.files || []).map((f) => f.path || f);
            if (files.some((f) => hotSet.has(f))) conflicting.add(t.id);
          });
          setConflictSet(conflicting);
        } else {
          setConflictSet(new Set());
        }
      } catch {}
    };
    load();
    const ti = setInterval(load, 15000);
    return () => clearInterval(ti);
  }, []);

  // Navigation clavier Alt+flèches dans la grille
  useEffect(() => {
    if (!gridMode) return;
    const handler = (e) => {
      if (!e.altKey) return;
      const dirs = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: layout.cols, ArrowUp: -layout.cols };
      const step = dirs[e.key];
      if (step === undefined) return;
      e.preventDefault();
      const total = layout.cols * layout.rows;
      setGridFocusIdx((prev) => {
        const next = ((prev ?? 0) + step + total) % total;
        // Zoomer sur la cellule focalisée si elle a un terminal
        const termId = gridTerminals[next];
        if (termId) setFocusedTerminal(termId);
        return next;
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gridMode, layout.cols, layout.rows, gridTerminals]);

  // WS page-level : suivi activité + sparkline buckets + détection attente + agents
  useWebSocket(useCallback((evt, data) => {
    // Tracker les invocations d'agents en temps réel
    if (evt === 'agent:invoked' && data?.sessionId && data?.agentType) {
      setAgentCallsMap((prev) => {
        const sessionAgents = { ...(prev[data.sessionId] || {}) };
        const existing = sessionAgents[data.agentType] || { count: 0, lastUsedAt: null, calls: [] };
        const calls = [...existing.calls, { description: data.description || '', timestamp: data.timestamp }].slice(-50);
        sessionAgents[data.agentType] = { count: data.count || existing.count + 1, lastUsedAt: data.timestamp, calls };
        return { ...prev, [data.sessionId]: sessionAgents };
      });
    }
    if (evt === 'terminal:output' && data?.terminalId) {
      const now = Date.now();
      setLastActivity((prev) => ({ ...prev, [data.terminalId]: now }));
      if (data.data) {
        const clean = stripAnsi(data.data);
        // Incrémenter le bucket courant (index 11 = le plus récent)
        setActivityBuckets((prev) => {
          const buckets = prev[data.terminalId] ? [...prev[data.terminalId]] : Array(12).fill(0);
          buckets[11] = (buckets[11] || 0) + 1;
          return { ...prev, [data.terminalId]: buckets };
        });
        // Détection de prompt d'attente sur la dernière ligne non-vide (#8, #27)
        const lastLine = clean.split('\n').filter((l) => l.trim()).pop() || '';
        setWaitingSet((prev) => {
          const next = new Set(prev);
          if (WAITING_PATTERNS.test(lastLine)) {
            // Notification navigateur si le terminal n'était pas déjà en attente (#27)
            if (!prev.has(data.terminalId) && 'Notification' in window && Notification.permission === 'granted') {
              const term = terminalsRef.current.find((t) => t.id === data.terminalId);
              new Notification('Terminal en attente de confirmation', {
                body: `"${term?.name || data.terminalId}" attend une réponse (y/N)`,
                icon: '/favicon.ico',
                tag: `waiting-${data.terminalId}`, // évite les doublons
              });
            }
            next.add(data.terminalId);
          } else if (clean.includes('\n') || clean.length > 5) {
            next.delete(data.terminalId);
          }
          return next;
        });
      }
    }
  }, []));

  // Rotation des buckets toutes les 5s (shift left, nouveau bucket vide à droite)
  useEffect(() => {
    const t = setInterval(() => {
      setActivityBuckets((prev) => {
        const next = {};
        Object.entries(prev).forEach(([id, buckets]) => {
          next[id] = [...buckets.slice(1), 0];
        });
        return next;
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Re-render toutes les 10s pour mettre à jour les badges de silence et durées
  useEffect(() => {
    const t = setInterval(() => setSilenceTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  // Échap pour quitter le zoom
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setFocusedTerminal(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Liste filtrée + épinglés en tête
  const filteredTerminals = useMemo(() => {
    let list = terminals;
    if (listFilter) {
      const q = listFilter.toLowerCase();
      list = list.filter((t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.directory || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      list = list.filter((t) =>
        statusFilter === 'ghost'    ? t.status === 'ghost' :
        statusFilter === 'silent'   ? (lastActivity[t.id] && (Date.now() - lastActivity[t.id]) > 120000) :
        statusFilter === 'waiting'  ? waitingSet.has(t.id) :
        t.status === statusFilter
      );
    }
    return [...list].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [terminals, listFilter, statusFilter, pinnedIds, lastActivity, silenceTick, waitingSet]);

  // Navigation clavier dans la liste (↑↓ + Enter/Espace) quand la liste est focalisée
  useEffect(() => {
    const el = terminalListRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setListFocusIdx((prev) => {
          const len = filteredTerminals.length;
          if (!len) return null;
          const base = prev ?? -1;
          return ((e.key === 'ArrowDown' ? base + 1 : base - 1) + len) % len;
        });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setListFocusIdx((prev) => {
          if (prev !== null && filteredTerminals[prev]) {
            const card = terminalListRef.current?.children[prev];
            if (card) card.click();
          }
          return prev;
        });
      }
    };
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, [filteredTerminals]);

  const togglePin = (id) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fetchTerminals = useCallback(async () => {
    try {
      const [terms, avail] = await Promise.all([
        fetch('/api/terminals').then((r) => r.json()),
        fetch('/api/terminals/available').then((r) => r.json()),
      ]);
      const termList = Array.isArray(terms) ? terms : [];
      setTerminals(termList);
      setAvailable(avail.available);
      // Initialiser agentCallsMap depuis les données persistées (usedAgents)
      setAgentCallsMap((prev) => {
        const next = { ...prev };
        for (const t of termList) {
          if (t.usedAgents && Object.keys(t.usedAgents).length > 0 && !prev[t.id]) {
            next[t.id] = t.usedAgents;
          }
        }
        return next;
      });
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
    setSpawnError(null);
    // Valider le chemin avant spawn (#20)
    if (directory.trim()) {
      try {
        const check = await fetch('/api/terminals/validate-path', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: directory.trim() }),
        });
        const checkData = await check.json();
        if (!checkData.valid) {
          setSpawnError(checkData.exists ? 'Ce chemin existe mais n\'est pas un répertoire' : `Répertoire introuvable : ${directory.trim()}`);
          return;
        }
      } catch {}
    }
    try {
      const res = await fetch('/api/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directory:       directory || undefined,
          name:            name || undefined,
          prompt:          prompt || undefined,
          model:           model || undefined,
          dangerousMode:   dangerousMode || undefined,
          injectContext:   injectContext,
          resumeSessionId: resumeSessionId.trim() || undefined, // #83
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.terminalId) {
        setSpawnError(data.error || `Erreur ${res.status}`);
        return;
      }
      if (directory.trim()) dirComboHistory.save(directory.trim());
      if (name.trim()) nameComboHistory.save(name.trim());
      setDirectory(''); setName(''); setPrompt(''); setResumeSessionId('');

      if (gridMode) {
        addToGrid(data.terminalId);
        await fetchTerminals();
      } else {
        // Attendre que la liste soit à jour AVANT d'activer :
        // le TerminalView doit monter avec terminalStatus correct pour que le layout soit stable
        await fetchTerminals();
        setActiveTerminal(data.terminalId);
      }
    } catch (err) {
      setSpawnError(err.message || 'Impossible de lancer le terminal');
    }
  };

  const toggleSelect = (id, e) => {
    if (!e.ctrlKey && !e.metaKey) return false; // pas de ctrl → pas de sélection
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    return true;
  };

  const killSelected = async () => {
    await Promise.allSettled([...selectedIds].map((id) =>
      fetch(`/api/terminals/${id}`, { method: 'DELETE' })
    ));
    setSelectedIds(new Set());
    fetchTerminals();
  };

  const broadcastCommand = async () => {
    if (!broadcastCmd.trim() || broadcasting) return;
    setBroadcasting(true);
    // Si des terminaux sont sélectionnés, envoyer uniquement à ceux-ci
    const targets = selectedIds.size > 0
      ? terminals.filter((t) => selectedIds.has(t.id) && t.status === 'running')
      : terminals.filter((t) => t.status === 'running');
    await Promise.allSettled(targets.map((t) =>
      fetch(`/api/terminals/${t.id}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: broadcastCmd + '\n' }),
      })
    ));
    setBroadcasting(false);
    setBroadcastCmd('');
  };

  const saveTemplate = () => {
    if (!directory.trim()) return;
    const tplName = name.trim() || directory.trim().replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Template';
    const tpl = { id: Date.now(), label: tplName, directory, name, prompt, model, dangerousMode, injectContext };
    const next = [tpl, ...templates.slice(0, 9)]; // max 10 templates
    setTemplates(next);
    localStorage.setItem('cs:term-templates', JSON.stringify(next));
  };

  const loadTemplate = (tpl) => {
    setDirectory(tpl.directory || '');
    setName(tpl.name || '');
    setPrompt(tpl.prompt || '');
    setModel(tpl.model || '');
    setDangerousMode(tpl.dangerousMode || false);
    setInjectContext(tpl.injectContext !== false);
  };

  const deleteTemplate = (id) => {
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    localStorage.setItem('cs:term-templates', JSON.stringify(next));
  };

  const killTerminal = async (id) => {
    await fetch(`/api/terminals/${id}`, { method: 'DELETE' });
    if (activeTerminal === id) setActiveTerminal(null);
    setGridTerminals((prev) => prev.filter((tid) => tid !== id));
    fetchTerminals();
  };

  // Relancer un terminal fermé avec les mêmes paramètres (dir, nom, modèle)
  const respawnTerminal = async (t) => {
    const res = await fetch('/api/terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directory:     t.directory || undefined,
        name:          t.name     || undefined,
        model:         t.model    || undefined,
        dangerousMode: t.dangerousMode || undefined,
      }),
    });
    const data = await res.json();
    if (res.ok && data.terminalId) {
      await fetchTerminals();
      setActiveTerminal(data.terminalId);
    }
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

  // Bannière premier lancement (#57) — affichée quand aucun terminal n'a jamais été créé
  const showWelcome = terminals.length === 0 && !localStorage.getItem('cs:welcome-dismissed');

  return (
    <div style={{ height: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column' }}>
      {/* Bannière d'accueil premier lancement (#57) */}
      {showWelcome && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(99,102,241,0.08))',
          border: '1px solid rgba(139,92,246,0.3)', borderRadius: 10,
          padding: '16px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#c0caf5', marginBottom: 6 }}>
                🚀 Bienvenue dans Claude Supervisor !
              </div>
              <div style={{ fontSize: 12, color: '#a9b1d6', marginBottom: 12 }}>
                Supervisez plusieurs instances Claude Code en parallèle depuis ce tableau de bord.
              </div>
            </div>
            <button onClick={() => { localStorage.setItem('cs:welcome-dismissed', '1'); fetchTerminals(); }}
              style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { step: '1', icon: '>_', title: 'Créer un terminal', desc: 'Remplissez le formulaire ci-contre et cliquez "Lancer Claude Code".' },
              { step: '2', icon: '🔌', title: 'Configurer le MCP', desc: `Ajoutez dans votre .mcp.json :\n{ "supervisor": { "command": "node", "args": ["${window.location.hostname === 'localhost' ? 'mcp/supervisor-mcp.js' : '/path/to/mcp/supervisor-mcp.js'}"] } }` },
              { step: '3', icon: '👥', title: 'Lancer un Squad', desc: 'Allez dans "Squad Mode" pour orchestrer plusieurs agents en parallèle avec des dépendances.' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(139,92,246,0.2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 4 }}>Étape {step} — {icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#c0caf5', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 11, color: '#565f89', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h2 style={{ margin: 0 }}>Terminaux Claude Code</h2>
          {/* Barre de statut globale */}
          {terminals.length > 0 && (() => {
            const running  = terminals.filter((t) => t.status === 'running').length;
            const ghost    = terminals.filter((t) => t.status === 'ghost').length;
            const silent   = terminals.filter((t) => { const la = lastActivity[t.id]; return t.status === 'running' && la && (Date.now() - la) > 120000; }).length;
            const waiting  = terminals.filter((t) => waitingSet.has(t.id)).length;
            const mkBadge = (key, label, bg, color, extra) => (
              <button
                key={key}
                onClick={() => setStatusFilter((f) => f === key ? null : key)}
                style={{
                  padding: '2px 9px', borderRadius: 10, background: statusFilter === key ? color : bg,
                  color: statusFilter === key ? 'white' : color, fontWeight: 600,
                  border: `1px solid ${statusFilter === key ? color : 'transparent'}`,
                  cursor: 'pointer', fontSize: 12, ...extra,
                }}
                title="Cliquer pour filtrer"
              >
                {label}
              </button>
            );
            return (
              <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                {mkBadge('running', `● ${running} actif${running !== 1 ? 's' : ''}`, 'rgba(34,197,94,0.12)', '#22c55e')}
                {ghost > 0 && mkBadge('ghost', `⏸ ${ghost} interrompu${ghost !== 1 ? 's' : ''}`, 'rgba(245,158,11,0.12)', '#f59e0b')}
                {waiting > 0 && mkBadge('waiting', `⏳ ${waiting} en attente`, 'rgba(139,92,246,0.12)', '#8b5cf6', { animation: 'ws-blink 1.5s ease-in-out infinite' })}
                {silent > 0 && mkBadge('silent', `⚠ ${silent} silencieux`, 'rgba(239,68,68,0.12)', '#ef4444', { animation: 'ws-blink 2s ease-in-out infinite' })}
                {statusFilter && (
                  <button onClick={() => setStatusFilter(null)} style={{ padding: '2px 7px', borderRadius: 10, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', cursor: 'pointer', fontSize: 11 }}>
                    ✕ filtre
                  </button>
                )}
              </div>
            );
          })()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!available && (
            <span style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: 6 }}
              title="Exécutez : cd backend && npm rebuild node-pty">
              node-pty non disponible — <code style={{ fontSize: 11 }}>npm rebuild node-pty</code>
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
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12, flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Panneau gauche : formulaire + liste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
          {/* Formulaire de lancement */}
          <div ref={formRef} className="card" style={{ padding: 0, overflow: 'visible' }}>
            {/* En-tête du formulaire — cliquable pour réduire */}
            <div
              onClick={() => { const v = !formCollapsed; setFormCollapsed(v); localStorage.setItem('cs:form-collapsed', v ? '1' : '0'); }}
              style={{ padding: '10px 14px', borderBottom: formCollapsed ? 'none' : '1px solid rgba(45,49,72,0.6)', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 11, color: '#565f89', transition: 'transform 0.2s', transform: formCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c0caf5' }}>Nouvelle session</span>
                {!available && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>
                    node-pty indisponible
                  </span>
                )}
              </div>
            </div>

            {!formCollapsed && <form onSubmit={spawnTerminal} style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>

              {/* Templates sauvegardés */}
              {templates.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {templates.map((tpl) => (
                    <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => loadTemplate(tpl)}
                        title={`Charger : ${tpl.directory}`}
                        style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 11, padding: '2px 7px 2px 8px', fontFamily: 'monospace' }}
                      >
                        {tpl.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(tpl.id)}
                        style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 10, padding: '2px 6px 2px 2px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Répertoire */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#565f89', marginBottom: 5, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  📁 Répertoire
                </label>
                <ComboBox
                  value={directory}
                  onChange={setDirectory}
                  placeholder="C:/mon-projet"
                  storageKey="cs:dir-history"
                  itemIcon="📁"
                  inputStyle={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>

              {/* Nom — combobox avec historique */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#565f89', marginBottom: 5, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  ✏ Nom <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(optionnel)</span>
                </label>
                <ComboBox
                  value={name}
                  onChange={setName}
                  placeholder="ex: Backend auth"
                  storageKey="cs:name-history"
                  inputStyle={{ fontSize: 12 }}
                />
              </div>

              {/* Prompt */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#565f89', marginBottom: 5, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                  💬 Prompt initial <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(optionnel)</span>
                </label>
                <textarea
                  placeholder="Décris la tâche à accomplir…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="form-input"
                  rows={2}
                  style={{ resize: 'vertical', fontSize: 12, lineHeight: 1.5 }}
                />
              </div>

              {/* Options avancées — pliables */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
                    color: '#565f89', fontSize: 11, fontWeight: 600, letterSpacing: '0.3px',
                    textTransform: 'uppercase',
                  }}
                >
                  <span style={{ fontSize: 9, transition: 'transform 0.2s', display: 'inline-block', transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  Options avancées
                  {(model || dangerousMode || !injectContext) && (
                    <span style={{ marginLeft: 4, width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block', flexShrink: 0 }} />
                  )}
                </button>

                {showAdvanced && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(45,49,72,0.5)' }}>

                    {/* Modèle — chips */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#565f89', marginBottom: 6, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        🤖 Modèle
                      </label>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {[
                          { value: '',                        label: 'Défaut' },
                          { value: 'claude-sonnet-4-6',       label: 'Sonnet 4.6' },
                          { value: 'claude-opus-4-6',         label: 'Opus 4.6' },
                          { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
                        ].map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => setModel(m.value)}
                            style={{
                              padding: '4px 10px', borderRadius: 20,
                              border: model === m.value ? '1px solid rgba(139,92,246,0.6)' : '1px solid #2d3148',
                              background: model === m.value ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.03)',
                              color: model === m.value ? '#8b5cf6' : '#6b7280',
                              cursor: 'pointer', fontSize: 11, fontWeight: model === m.value ? 700 : 400,
                              transition: 'all 0.15s',
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Injecter le contexte */}
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}
                      title={`Injecte le Contexte Partagé (${contextCount} entrée${contextCount !== 1 ? 's' : ''}) dans le prompt initial.`}
                    >
                      <div
                        onClick={() => setInjectContext((v) => !v)}
                        style={{
                          width: 30, height: 16, borderRadius: 8, flexShrink: 0, marginTop: 1,
                          background: injectContext ? 'rgba(139,92,246,0.7)' : '#2d3148',
                          position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 2, left: injectContext ? 16 : 2,
                          width: 12, height: 12, borderRadius: '50%', background: 'white',
                          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#c0caf5', lineHeight: 1.3 }}>Injecter le contexte partagé</div>
                        <div style={{ fontSize: 10, color: '#565f89', marginTop: 2 }}>
                          {contextCount > 0 ? `${contextCount} entrée${contextCount !== 1 ? 's' : ''} disponible${contextCount !== 1 ? 's' : ''}` : 'Contexte partagé vide'}
                        </div>
                      </div>
                    </label>

                    {/* Reprendre une session (#83) */}
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#565f89', marginBottom: 5, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        ↺ Reprendre une session <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>(optionnel)</span>
                      </label>
                      <input
                        value={resumeSessionId}
                        onChange={(e) => setResumeSessionId(e.target.value)}
                        placeholder="ID de session Claude Code"
                        className="form-input"
                        style={{ fontFamily: 'monospace', fontSize: 11 }}
                      />
                      <div style={{ fontSize: 10, color: '#565f89', marginTop: 3 }}>Passe <code style={{ fontSize: 10 }}>--resume ID</code> à Claude Code. Remplace le prompt initial.</div>
                    </div>

                    {/* Mode dangereux (#69) — toggle + confirmation explicite */}
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
                      <div
                        onClick={() => {
                          if (!dangerousMode) {
                            // Confirmation explicite avant d'activer (#69)
                            if (!window.confirm('⚠ Mode dangereux : Claude Code pourra modifier et supprimer des fichiers sans demander de confirmation.\n\nÊtes-vous sûr de vouloir activer ce mode ?')) return;
                          }
                          setDangerousMode((v) => !v);
                        }}
                        style={{
                          width: 30, height: 16, borderRadius: 8, flexShrink: 0, marginTop: 1,
                          background: dangerousMode ? 'rgba(239,68,68,0.7)' : '#2d3148',
                          position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 2, left: dangerousMode ? 16 : 2,
                          width: 12, height: 12, borderRadius: '50%', background: 'white',
                          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: dangerousMode ? '#ef4444' : '#c0caf5', lineHeight: 1.3 }}>Mode dangereux</div>
                        <div style={{ fontSize: 10, color: dangerousMode ? '#fca5a5' : '#565f89', marginTop: 2 }}>
                          {dangerousMode
                            ? '⚠ Claude peut modifier/supprimer des fichiers sans confirmation !'
                            : 'Skip permissions — exécute sans confirmation'}
                        </div>
                      </div>
                    </label>

                  </div>
                )}
              </div>

              {/* Bouton submit + sauvegarder template */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="submit"
                  disabled={!available}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '9px 14px', borderRadius: 8, border: 'none', cursor: available ? 'pointer' : 'not-allowed',
                    background: available ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : '#2d3148',
                    color: available ? 'white' : '#565f89',
                    fontSize: 13, fontWeight: 700,
                    boxShadow: available ? '0 2px 12px rgba(139,92,246,0.35)' : 'none',
                    transition: 'all 0.2s',
                    opacity: available ? 1 : 0.6,
                  }}
                >
                  <span style={{ fontSize: 14 }}>▶</span>
                  Lancer Claude Code
                </button>
                {directory.trim() && (
                  <button
                    type="button"
                    onClick={saveTemplate}
                    title="Sauvegarder comme template"
                    style={{
                      padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)',
                      background: 'rgba(139,92,246,0.1)', color: '#a78bfa',
                      cursor: 'pointer', fontSize: 14, lineHeight: 1,
                    }}
                  >
                    💾
                  </button>
                )}
              </div>

              {spawnError && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                }}>
                  <span style={{ color: '#ef4444', fontSize: 13, flexShrink: 0 }}>✗</span>
                  <span style={{ fontSize: 11, color: '#ef4444', lineHeight: 1.4, wordBreak: 'break-word' }}>{spawnError}</span>
                  <button onClick={() => setSpawnError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: 0, flexShrink: 0 }}>✕</button>
                </div>
              )}

            </form>}
          </div>

          {/* Barre d'actions batch (sélection multiple Ctrl+clic) */}
          {selectedIds.size > 0 && (
            <div className="card" style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>
                {selectedIds.size} terminal{selectedIds.size > 1 ? 'ux' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={killSelected}
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, color: '#ef4444', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '4px 10px' }}
                >
                  ✕ Arrêter ({selectedIds.size})
                </button>
                <button
                  onClick={() => {
                    setBroadcastCmd('');
                    setSelectedIds(new Set());
                  }}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}
                >
                  Désélectionner
                </button>
              </div>
            </div>
          )}

          {/* Broadcast commande */}
          {terminals.some((t) => t.status === 'running') && (
            <div className="card" style={{ padding: '10px 12px' }}>
              {(() => {
                const broadcastTargets = selectedIds.size > 0
                  ? terminals.filter((t) => selectedIds.has(t.id) && t.status === 'running')
                  : terminals.filter((t) => t.status === 'running');
                return (
                  <>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#565f89', marginBottom: 6, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                      📡 {selectedIds.size > 0 ? `Envoyer aux sélectionnés (${broadcastTargets.length})` : 'Envoyer à tous'}
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={broadcastCmd}
                        onChange={(e) => setBroadcastCmd(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && broadcastCommand()}
                        placeholder="commande…"
                        style={{
                          flex: 1, background: '#1a1b26', border: '1px solid #2d3148', borderRadius: 5,
                          padding: '5px 8px', color: '#c0caf5', fontSize: 12, fontFamily: 'monospace',
                        }}
                      />
                      <button
                        onClick={broadcastCommand}
                        disabled={!broadcastCmd.trim() || broadcasting || broadcastTargets.length === 0}
                        style={{
                          background: broadcasting ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.15)',
                          border: '1px solid rgba(139,92,246,0.4)', borderRadius: 5,
                          color: '#8b5cf6', cursor: (broadcasting || broadcastTargets.length === 0) ? 'not-allowed' : 'pointer',
                          fontSize: 11, fontWeight: 700, padding: '5px 10px', whiteSpace: 'nowrap',
                          opacity: (!broadcastCmd.trim() || broadcasting || broadcastTargets.length === 0) ? 0.5 : 1,
                        }}
                      >
                        {broadcasting ? '…' : `↗ ${broadcastTargets.length}`}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Liste des terminaux */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ fontSize: 13, margin: 0 }}>
                Terminaux ({filteredTerminals.length}{filteredTerminals.length !== terminals.length ? `/${terminals.length}` : ''})
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
            {/* Barre de recherche/filtre */}
            {terminals.length > 1 && (
              <div style={{ marginBottom: 6, position: 'relative' }}>
                <input
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                  placeholder="🔍 Filtrer par nom ou répertoire…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#1a1b26', border: `1px solid ${listFilter ? '#8b5cf6' : '#2d3148'}`,
                    borderRadius: 6, padding: '5px 28px 5px 8px',
                    color: '#c0caf5', fontSize: 11, fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
                {listFilter && (
                  <button
                    onClick={() => setListFilter('')}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
                  >✕</button>
                )}
              </div>
            )}

            {terminals.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                Aucun terminal
              </div>
            ) : filteredTerminals.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                Aucun terminal ne correspond au filtre
              </div>
            ) : (
              <div
                ref={terminalListRef}
                tabIndex={0}
                style={{ display: 'grid', gap: 5, outline: 'none' }}
                onFocus={() => { if (listFocusIdx === null && filteredTerminals.length) setListFocusIdx(0); }}
                onBlur={() => setListFocusIdx(null)}
              >
                {filteredTerminals.map((t) => {
                  const isActive   = !gridMode && activeTerminal === t.id;
                  const inGrid     = gridMode && gridTerminals.includes(t.id);
                  const gridIndex  = gridTerminals.indexOf(t.id);
                  const isGhostT   = t.status === 'ghost';
                  const statusColor = t.status === 'running' ? '#22c55e' : isGhostT ? '#f59e0b' : '#ef4444';
                  // Durée depuis le démarrage
                  const elapsed = (() => {
                    const since = t.startedAt || t.createdAt;
                    if (!since) return null;
                    const s = Math.floor((Date.now() - new Date(since)) / 1000);
                    if (s < 60) return `${s}s`;
                    if (s < 3600) return `${Math.floor(s/60)}m`;
                    return `${Math.floor(s/3600)}h${Math.floor((s%3600)/60).toString().padStart(2,'0')}`;
                  })();
                  // Détection de silence : pas d'output depuis >2 min
                  const la = lastActivity[t.id];
                  const silentMs = (la && t.status === 'running') ? (Date.now() - la) : null;
                  const isSilent = silentMs !== null && silentMs > 120000;
                  const silentLabel = silentMs ? (silentMs < 3600000 ? `${Math.floor(silentMs/60000)}min` : `${Math.floor(silentMs/3600000)}h`) : null;
                  // Couleur de branche git + sélection + extras
                  const branchColor  = branchColors[t.id];
                  const isSelected   = selectedIds.has(t.id);
                  const isPinned     = pinnedIds.has(t.id);
                  const hasConflict  = conflictSet.has(t.id);
                  const isWaiting    = waitingSet.has(t.id);
                  const sparkBuckets = activityBuckets[t.id] || Array(12).fill(0);
                  const isKeyFocused = listFocusIdx !== null && filteredTerminals[listFocusIdx]?.id === t.id;

                  return (
                    <div
                      key={t.id}
                      className="card terminal-card"
                      style={{
                        padding: '8px 10px', minWidth: 0, overflow: 'hidden',
                        backgroundImage: isGhostT ? 'repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(245,158,11,0.04) 6px, rgba(245,158,11,0.04) 12px)' : undefined,
                        cursor: 'pointer',
                        borderTop:    isSelected ? '2px solid #f59e0b' : isKeyFocused ? '2px solid #a78bfa' : isActive || inGrid ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderRight:  isSelected ? '2px solid #f59e0b' : isKeyFocused ? '2px solid #a78bfa' : isActive || inGrid ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderBottom: isSelected ? '2px solid #f59e0b' : isKeyFocused ? '2px solid #a78bfa' : isActive || inGrid ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderLeft:   `3px solid ${isWaiting ? '#8b5cf6' : branchColor || statusColor}`,
                        opacity: gridMode && gridTerminals.length >= layout.max && !inGrid ? 0.5 : 1,
                      }}
                      onClick={(e) => { if (!toggleSelect(t.id, e)) handleTerminalClick(t.id); }}
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
                            {/* Badge sélection */}
                            {isSelected && (
                              <span style={{ fontSize: 10, background: '#f59e0b', color: 'white', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>✓</span>
                            )}
                            {/* Badge numéro de cellule en mode grille */}
                            {inGrid && !isSelected && (
                              <span style={{ fontSize: 10, background: 'var(--accent)', color: 'white', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                                {gridIndex + 1}
                              </span>
                            )}
                            <span
                              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              onDoubleClick={(e) => { e.stopPropagation(); setEditingListId(t.id); setEditingListName(t.name); }}
                              title="Double-cliquer pour renommer — Ctrl+clic pour sélectionner"
                            >
                              {t.name}
                            </span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                          {isWaiting && (
                            <span className="waiting-badge" title="Terminal en attente de confirmation">⏳</span>
                          )}
                          {hasConflict && (
                            <span title="Conflit de fichiers détecté" style={{ fontSize: 11, color: '#f59e0b' }}>⚡</span>
                          )}
                          <span style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 8,
                            background: t.status === 'running' ? 'rgba(34,197,94,0.15)' : isGhostT ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            color: statusColor,
                            fontWeight: 700, textTransform: 'uppercase',
                          }}>
                            {isGhostT ? 'interrompu' : t.status}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePin(t.id); }}
                            title={isPinned ? 'Désépingler' : 'Épingler en tête de liste'}
                            style={{ background: 'none', border: 'none', color: isPinned ? '#f59e0b' : '#565f89', cursor: 'pointer', fontSize: 12, padding: '0 1px', lineHeight: 1, opacity: isPinned ? 1 : 0.5 }}
                          >
                            📌
                          </button>
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
                              title="Reprendre la session interrompue"
                            >
                              ↺
                            </button>
                          )}
                          {(t.status === 'exited' || t.status === 'killed') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); respawnTerminal(t); }}
                              style={{ background: 'none', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 3, color: '#8b5cf6', cursor: 'pointer', fontSize: 11, padding: '1px 6px', lineHeight: 1 }}
                              title={`Relancer dans ${t.directory || 'même répertoire'}`}
                            >
                              ▶ Relancer
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        {branchColor && (
                          <span style={{ fontSize: 9, color: branchColor, fontFamily: 'monospace', fontWeight: 700, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}
                            title={`Branche git`}>
                            ⎇
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={t.directory}>
                          {t.directory ? (() => { const parts = t.directory.replace(/\\/g, '/').split('/').filter(Boolean); return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : t.directory; })() : '—'}
                        </span>
                        {isSilent && (
                          <span className="silence-badge" title={`Aucune activité depuis ${silentLabel}`}>
                            🔇 {silentLabel}
                          </span>
                        )}
                        {elapsed && !isSilent && (
                          <span style={{ fontSize: 9, color: '#565f89', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }} title={`Actif depuis ${elapsed}`}>
                            {elapsed}
                          </span>
                        )}
                        {t.status === 'running' && (
                          <Sparkline buckets={sparkBuckets} />
                        )}
                      </div>
                      {/* Chips agents subagents */}
                      {(() => {
                        const agents = Object.entries(agentCallsMap[t.id] || {});
                        if (agents.length === 0) return null;
                        const sorted = agents.sort((a, b) => b[1].count - a[1].count);
                        const visible = sorted.slice(0, 3);
                        const overflow = sorted.length - 3;
                        return (
                          <div
                            style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5, paddingTop: 4, borderTop: '1px solid rgba(45,49,72,0.5)' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTerminal(t.id);
                              // Ouvre directement l'onglet Agents via un event custom
                              setTimeout(() => window.dispatchEvent(new CustomEvent('cs:open-agents-tab', { detail: { terminalId: t.id } })), 50);
                            }}
                          >
                            {visible.map(([type, info]) => (
                              <span
                                key={type}
                                title={`${type} — ${info.count} appel${info.count !== 1 ? 's' : ''}, dernier ${fmtRelative(info.lastUsedAt)}`}
                                aria-label={`${type}, ${info.count} appels, dernier ${fmtRelative(info.lastUsedAt)}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  fontSize: 10, height: 18, padding: '0 6px', borderRadius: 9,
                                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                                  color: '#a78bfa', cursor: 'pointer',
                                }}
                              >
                                {type.length > 16 ? type.substring(0, 16) + '…' : type}
                                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>×{info.count}</span>
                              </span>
                            ))}
                            {overflow > 0 && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center',
                                fontSize: 10, height: 18, padding: '0 6px', borderRadius: 9,
                                background: 'rgba(100,116,139,0.2)', color: '#64748b', cursor: 'pointer',
                              }}>
                                +{overflow}
                              </span>
                            )}
                          </div>
                        );
                      })()}
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
          <div style={{ position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
              gridTemplateRows:    `repeat(${layout.rows}, 1fr)`,
              gap: 4,
              flex: 1,
              minHeight: 0,
            }}>
              {gridCells.map((termId, i) => {
                if (!termId) return <EmptyCell key={i} index={i} />;
                const t = terminals.find((x) => x.id === termId);
                return (
                  <div key={termId} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#1a1b26', minHeight: 0 }}>
                    <TerminalView
                      key={`${termId}-${t?.status === 'ghost' ? 'ghost' : 'live'}`}
                      terminalId={termId}
                      terminalName={t?.name}
                      terminalDirectory={t?.directory}
                      terminalStatus={t?.status}
                      isWaiting={waitingSet.has(termId)}
                      terminalAgents={Object.entries(agentCallsMap[termId] || {}).map(([type, info]) => ({ type, ...info }))}
                      onClose={() => removeFromGrid(termId)}
                      onRename={renameTerminal}
                      onResume={fetchTerminals}
                      onZoom={() => setFocusedTerminal(termId)}
                      compact={layout.cols > 1 || layout.rows > 2}
                    />
                  </div>
                );
              })}
            </div>
            {/* Overlay zoom : terminal en plein écran dans la grille */}
            {focusedTerminal && (() => {
              const ft = terminals.find((x) => x.id === focusedTerminal);
              return (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 1000,
                  background: 'rgba(0,0,0,0.85)',
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{
                    flex: 1, margin: 16, borderRadius: 10, overflow: 'hidden',
                    border: '1px solid var(--accent)', background: '#1a1b26',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <TerminalView
                      key={`zoom-${focusedTerminal}`}
                      terminalId={focusedTerminal}
                      terminalName={ft?.name}
                      terminalDirectory={ft?.directory}
                      terminalStatus={ft?.status}
                      isWaiting={waitingSet.has(focusedTerminal)}
                      onClose={() => setFocusedTerminal(null)}
                      onRename={renameTerminal}
                      onResume={fetchTerminals}
                      compact={false}
                    />
                  </div>
                  <div style={{ textAlign: 'center', paddingBottom: 10, fontSize: 11, color: '#565f89' }}>
                    Échap pour revenir à la grille
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          // ---- Mode simple ----
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#1a1b26', minHeight: 400, minWidth: 0 }}>
            {activeTerminal ? (
              <TerminalView
                key={`${activeTerminal}-${terminals.find((t) => t.id === activeTerminal)?.status === 'ghost' ? 'ghost' : 'live'}`}
                terminalId={activeTerminal}
                terminalName={terminals.find((t) => t.id === activeTerminal)?.name}
                terminalDirectory={terminals.find((t) => t.id === activeTerminal)?.directory}
                terminalStatus={terminals.find((t) => t.id === activeTerminal)?.status}
                isWaiting={waitingSet.has(activeTerminal)}
                terminalAgents={Object.entries(agentCallsMap[activeTerminal] || {}).map(([type, info]) => ({ type, ...info }))}
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
        .silence-badge { font-size: 9px; padding: 1px 6px; border-radius: 8px; background: rgba(239,68,68,0.12); color: #ef4444; font-weight: 700; flex-shrink: 0; animation: silence-pulse 2s ease-in-out infinite; }
        .waiting-badge { font-size: 11px; flex-shrink: 0; animation: waiting-pulse 1.2s ease-in-out infinite; }
        @keyframes silence-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes waiting-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.15); } }
        @keyframes ws-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
        .terminal-name-editable:hover .rename-hint { opacity: 0.6 !important; }
        .terminal-name-editable:hover .rename-hint:hover { opacity: 1 !important; color: var(--accent); }
      `}</style>
    </div>
  );
}

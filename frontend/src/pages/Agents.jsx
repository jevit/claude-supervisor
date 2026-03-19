import React, { useState, useEffect, useCallback, useRef } from 'react';

/* ── Documentation des clés de config ─────────────────────────── */
const CONFIG_DOCS = {
  // ── Settings projet / supervisor ──────────────────────────────
  maxTerminals: {
    label: 'Terminaux max',
    desc: 'Nombre maximum de terminaux PTY ouverts simultanément.',
    tip: 'Au-delà de cette limite, les nouveaux terminaux sont refusés.',
    example: '5',
  },
  heartbeatInterval: {
    label: 'Heartbeat (ms)',
    desc: 'Fréquence en ms à laquelle le frontend envoie un ping WebSocket pour maintenir la connexion.',
    tip: 'Trop bas = charge réseau inutile. Trop haut = déconnexions non détectées.',
    example: '5000 (5 secondes)',
  },
  maxEvents: {
    label: 'Events max',
    desc: 'Taille maximale du journal d\'événements en mémoire (EventLog).',
    tip: 'Les événements les plus anciens sont supprimés quand la limite est atteinte.',
    example: '500',
  },
  worktreeBase: {
    label: 'Base worktrees',
    desc: 'Répertoire racine où les worktrees Git isolés sont créés pour les squads.',
    tip: 'Chaque agent d\'un squad avec "Worktrees isolés" reçoit un sous-dossier ici.',
    example: 'C:/Perso/Workspace3/cs-worktrees',
  },
  dangerousModeDefault: {
    label: 'Dangerous mode (défaut)',
    desc: 'Si true, les terminaux sont démarrés avec --dangerously-skip-permissions par défaut.',
    tip: '⚠ Permet à Claude d\'exécuter des commandes sans confirmation. À utiliser avec précaution.',
    example: 'true / false',
  },
  showConflicts: {
    label: 'Afficher Conflits',
    desc: 'Active le module "Conflits & Locks" dans la sidebar.',
    tip: 'Peut être activé depuis la page Paramètres.',
    example: 'true / false',
  },
  showAnalytics: {
    label: 'Afficher Analytics',
    desc: 'Active le module "Analytics" dans la sidebar.',
    example: 'true / false',
  },
  showJournal: {
    label: 'Afficher Journal',
    desc: 'Active le module "Journal" (Timeline) dans la sidebar.',
    example: 'true / false',
  },

  // ── agents (sous-objet) ───────────────────────────────────────
  defaultModel: {
    label: 'Modèle par défaut',
    desc: 'Modèle Claude utilisé par défaut pour les nouveaux terminaux et squads.',
    tip: 'Peut être surchargé par terminal ou par membre de squad.',
    example: 'claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5-20251001',
  },
  supervisorModel: {
    label: 'Modèle superviseur',
    desc: 'Modèle utilisé par le service AgentSupervisor (API Anthropic) pour orchestrer les agents.',
    tip: 'N\'a d\'effet que si ANTHROPIC_API_KEY est définie.',
    example: 'claude-opus-4-6',
  },
  maxConcurrentAgents: {
    label: 'Agents simultanés max',
    desc: 'Nombre max d\'agents que le superviseur peut orchestrer en parallèle via l\'API Anthropic.',
    example: '5',
  },

  // ── Settings utilisateur (~/.claude/settings.json) ────────────
  model: {
    label: 'Modèle Claude Code',
    desc: 'Modèle par défaut utilisé par Claude Code CLI pour toutes les conversations.',
    tip: 'Peut être surchargé par projet dans .claude/settings.json.',
    example: 'sonnet, opus, haiku',
  },
  skipDangerousModePermissionPrompt: {
    label: 'Skip prompt dangerous mode',
    desc: 'Si true, supprime le prompt de confirmation au démarrage en mode --dangerously-skip-permissions.',
    tip: '⚠ À activer uniquement si vous avez confiance dans les outils invoqués.',
    example: 'true / false',
  },
  attribution: {
    label: 'Attribution',
    desc: 'Métadonnées de commit/PR ajoutées automatiquement par Claude Code lors des commits.',
    tip: 'Laissez vide pour ne pas injecter d\'attribution dans les commits.',
    example: '{ "commit": "", "pr": "" }',
  },

  // ── Hooks ─────────────────────────────────────────────────────
  PostToolUse: {
    label: 'PostToolUse',
    desc: 'Hooks exécutés après chaque appel d\'outil par Claude (ex: Edit, Bash, Write…).',
    tip: 'Utilisé ici pour reporter les actions au supervisor via post-tool-reporter.js.',
    example: 'node hooks/post-tool-reporter.js',
  },
  PreToolUse: {
    label: 'PreToolUse',
    desc: 'Hooks exécutés avant chaque appel d\'outil. Peut bloquer l\'exécution (exit code 2).',
    tip: 'Utile pour valider ou journaliser les actions avant qu\'elles ne soient exécutées.',
    example: 'node hooks/pre-tool-guard.js',
  },
  Stop: {
    label: 'Stop',
    desc: 'Hook exécuté quand Claude termine une réponse.',
    example: 'node hooks/on-stop.js',
  },
  Notification: {
    label: 'Notification',
    desc: 'Hook exécuté quand Claude envoie une notification (besoin d\'approbation, etc.).',
    example: 'node hooks/notify.js',
  },

  // ── MCP ───────────────────────────────────────────────────────
  SUPERVISOR_URL: {
    label: 'URL Supervisor',
    desc: 'URL du backend claude-supervisor que le serveur MCP appelle pour enregistrer les sessions.',
    example: 'http://localhost:3001',
  },
  SESSION_DIR: {
    label: 'Répertoire session',
    desc: 'Répertoire de travail utilisé par le MCP pour identifier la session courante.',
    tip: 'Doit correspondre au répertoire où Claude Code est lancé.',
    example: 'C:/Perso/Workspace3',
  },
};

/* ── Tooltip informatif ────────────────────────────────────────── */
function InfoTooltip({ docKey }) {
  const [visible, setVisible] = useState(false);
  const doc = CONFIG_DOCS[docKey];
  if (!doc) return null;

  return (
    <span className="cfg-info-wrap">
      <span
        className="cfg-info-icon"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >ℹ</span>
      {visible && (
        <span className="cfg-tooltip">
          {doc.label && <span className="cfg-tt-label">{doc.label}</span>}
          <span className="cfg-tt-desc">{doc.desc}</span>
          {doc.tip && <span className="cfg-tt-tip">💡 {doc.tip}</span>}
          {doc.example && (
            <span className="cfg-tt-example">
              <span className="cfg-tt-ex-label">Exemple :</span> <code>{doc.example}</code>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/* ── Carte d'un agent ──────────────────────────────────────────── */
function AgentCard({ agent, onClick }) {
  const modelColor = {
    opus:   '#f59e0b',
    sonnet: '#8b5cf6',
    haiku:  '#22d3ee',
  };
  const color = modelColor[agent.model] || '#64748b';

  return (
    <div className="ag-card" onClick={() => onClick(agent)}>
      <div className="ag-card-header">
        <span className="ag-card-name">{agent.name}</span>
        <span className="ag-card-model" style={{ color }}>{agent.model}</span>
      </div>
      <p className="ag-card-desc">{agent.description || <em>Pas de description</em>}</p>
      {agent.tools.length > 0 && (
        <div className="ag-card-tools">
          {agent.tools.map((t) => (
            <span key={t} className="ag-tool-chip">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Modal détail d'un agent ───────────────────────────────────── */
function AgentModal({ agentId, onClose }) {
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((d) => { setAgent(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentId]);

  // Fermer avec Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const modelColor = { opus: '#f59e0b', sonnet: '#8b5cf6', haiku: '#22d3ee' };

  return (
    <div className="ag-overlay" onClick={onClose}>
      <div className="ag-modal" onClick={(e) => e.stopPropagation()}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            Chargement…
          </div>
        )}
        {!loading && agent && (
          <>
            <div className="ag-modal-header">
              <div>
                <div className="ag-modal-name">{agent.name}</div>
                <div className="ag-modal-meta">
                  <span style={{ color: modelColor[agent.model] || '#64748b' }}>{agent.model}</span>
                  {agent.tools.length > 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      · Tools : {agent.tools.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <button className="ag-close-btn" onClick={onClose}>✕</button>
            </div>
            {agent.description && (
              <p className="ag-modal-desc">{agent.description}</p>
            )}
            <div className="ag-modal-prompt-label">System prompt</div>
            <pre className="ag-modal-prompt">{agent.prompt}</pre>
          </>
        )}
        {!loading && !agent && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--error, #ef4444)' }}>
            Impossible de charger l'agent.
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Panneau collapsible générique ────────────────────────────── */
function Panel({ title, badge, badgeColor = '#8b5cf6', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cfg-panel">
      <button className="cfg-panel-header" onClick={() => setOpen((v) => !v)}>
        <span className="cfg-panel-title">{title}</span>
        {badge != null && (
          <span className="cfg-badge" style={{ background: badgeColor }}>{badge}</span>
        )}
        <span className="cfg-panel-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="cfg-panel-body">{children}</div>}
    </div>
  );
}

/* ── Affichage JSON formaté ────────────────────────────────────── */
function JsonView({ data }) {
  if (!data) return <div className="cfg-empty">Non disponible</div>;
  return (
    <pre className="cfg-json">{JSON.stringify(data, null, 2)}</pre>
  );
}

/* ── Tableau clé/valeur plat ───────────────────────────────────── */
function KvTable({ data, skip = [] }) {
  if (!data) return <div className="cfg-empty">Non disponible</div>;
  const entries = Object.entries(data).filter(([k]) => !skip.includes(k));
  if (!entries.length) return <div className="cfg-empty">Vide</div>;
  return (
    <table className="cfg-table">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td className="cfg-key">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {k}
                <InfoTooltip docKey={k} />
              </span>
            </td>
            <td className="cfg-val">
              {typeof v === 'object' ? (
                <pre className="cfg-inline-json">{JSON.stringify(v, null, 2)}</pre>
              ) : (
                String(v)
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Section MCP servers ───────────────────────────────────────── */
function McpServers({ servers }) {
  if (!servers) return (
    <div className="cfg-empty">
      Aucun serveur MCP configuré.
      <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 Les serveurs MCP se configurent dans <code>~/.claude/mcp.json</code> (global) ou via <code>claude mcp add</code>.
        Ils exposent des outils supplémentaires à Claude Code.
      </span>
    </div>
  );
  return (
    <div className="cfg-mcp-list">
      {Object.entries(servers).map(([name, cfg]) => (
        <div key={name} className="cfg-mcp-item">
          <div className="cfg-mcp-name">{name}</div>
          <div className="cfg-mcp-cmd">
            <code>{cfg.command} {(cfg.args || []).join(' ')}</code>
          </div>
          {cfg.env && Object.keys(cfg.env).length > 0 && (
            <div className="cfg-mcp-env">
              {Object.entries(cfg.env).map(([k, v]) => (
                <span key={k} className="cfg-env-chip" title={CONFIG_DOCS[k]?.desc || ''}>
                  <b>{k}</b>={v}
                  {CONFIG_DOCS[k] && <InfoTooltip docKey={k} />}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Section Hooks ─────────────────────────────────────────────── */
function HooksTable({ hooks }) {
  if (!hooks?.length) return (
    <div className="cfg-empty">
      Aucun hook configuré.
      <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 Les hooks s'ajoutent dans <code>.claude/settings.json</code> (projet) ou <code>~/.claude/settings.json</code> (global) sous la clé <code>"hooks"</code>.
        Événements disponibles : <code>PostToolUse</code>, <code>PreToolUse</code>, <code>Stop</code>, <code>Notification</code>.
      </span>
    </div>
  );
  return (
    <table className="cfg-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Événement <InfoTooltip docKey="PostToolUse" /></th>
          <th>Matcher</th>
          <th>Commande</th>
        </tr>
      </thead>
      <tbody>
        {hooks.map((h, i) => (
          <tr key={i}>
            <td><span className="cfg-badge" style={{ background: h.source === 'project' ? '#8b5cf6' : '#22d3ee' }}>{h.source}</span></td>
            <td>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <code style={{ fontSize: 11 }}>{h.event}</code>
                <InfoTooltip docKey={h.event} />
              </span>
            </td>
            <td>
              <span title={h.matcher === '' ? 'Matcher vide = s\'applique à tous les outils' : `S'applique aux outils correspondant à "${h.matcher}"`}>
                <code style={{ fontSize: 11 }}>{h.matcher || '*'}</code>
              </span>
            </td>
            <td><code style={{ fontSize: 10, color: '#a9b1d6', wordBreak: 'break-all' }}>{h.command}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Section CLAUDE.md ─────────────────────────────────────────── */
function ClaudeMdList({ files }) {
  const [open, setOpen] = useState(null);
  if (!files?.length) return <div className="cfg-empty">Aucun fichier CLAUDE.md trouvé</div>;
  return (
    <div className="cfg-md-list">
      {files.map((f) => (
        <div key={f.path} className="cfg-md-item">
          <button className="cfg-md-header" onClick={() => setOpen(open === f.path ? null : f.path)}>
            <span className="cfg-md-path">{f.path}</span>
            <span className="cfg-muted" style={{ fontSize: 11 }}>{(f.size / 1024).toFixed(1)} Ko</span>
            <span>{open === f.path ? '▲' : '▼'}</span>
          </button>
          {open === f.path && (
            <pre className="cfg-md-content">{f.content}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Permissions allow/deny ────────────────────────────────────── */
function PermissionsPanel({ permissions }) {
  const { allow = [], deny = [] } = permissions || {};
  if (!allow.length && !deny.length) return (
    <div className="cfg-empty">
      Aucune permission explicite configurée — tous les outils nécessitent confirmation.
      <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 Ajoutez des permissions dans <code>.claude/settings.json</code> ou <code>~/.claude/settings.local.json</code> pour pré-approuver certains outils.
        Exemple : <code>"allow": ["Bash(git *)", "Read"]</code>
      </span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
      {allow.length > 0 && (
        <div>
          <div className="cfg-sub-title" style={{ color: '#10b981' }}>✓ Autorisés ({allow.length})</div>
          <div className="cfg-perm-chips">
            {allow.map((p) => <span key={p} className="cfg-perm-chip cfg-perm-allow">{p}</span>)}
          </div>
        </div>
      )}
      {deny.length > 0 && (
        <div>
          <div className="cfg-sub-title" style={{ color: '#ef4444' }}>✕ Refusés ({deny.length})</div>
          <div className="cfg-perm-chips">
            {deny.map((p) => <span key={p} className="cfg-perm-chip cfg-perm-deny">{p}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stats d'activité ──────────────────────────────────────────── */
function StatsPanel({ stats }) {
  if (!stats) return <div className="cfg-empty">Stats non disponibles</div>;
  const { activity = [], totals } = stats;
  const maxMsg = Math.max(...activity.map((d) => d.messageCount || 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
      {/* KPIs 14 jours */}
      <div className="cfg-stat-kpis">
        <div className="cfg-stat-kpi">
          <span className="cfg-stat-val">{totals.sessions}</span>
          <span className="cfg-stat-lbl">Sessions</span>
        </div>
        <div className="cfg-stat-kpi">
          <span className="cfg-stat-val">{totals.messages.toLocaleString()}</span>
          <span className="cfg-stat-lbl">Messages</span>
        </div>
        <div className="cfg-stat-kpi">
          <span className="cfg-stat-val">{totals.toolCalls.toLocaleString()}</span>
          <span className="cfg-stat-lbl">Appels d'outils</span>
        </div>
        <div className="cfg-stat-kpi" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          <span>Calculé au {stats.lastComputedDate}</span>
        </div>
      </div>

      {/* Sparkline barres */}
      {activity.length > 0 && (
        <div className="cfg-stat-bars">
          {activity.map((d) => (
            <div key={d.date} className="cfg-stat-bar-wrap" title={`${d.date}\n${d.messageCount} messages\n${d.sessionCount} sessions\n${d.toolCallCount} outils`}>
              <div
                className="cfg-stat-bar"
                style={{ height: `${Math.round((d.messageCount / maxMsg) * 60)}px` }}
              />
              <span className="cfg-stat-day">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tableau détaillé */}
      <table className="cfg-table" style={{ marginTop: 0 }}>
        <thead>
          <tr><th>Date</th><th>Sessions</th><th>Messages</th><th>Outils</th></tr>
        </thead>
        <tbody>
          {[...activity].reverse().map((d) => (
            <tr key={d.date}>
              <td className="cfg-key">{d.date}</td>
              <td className="cfg-val">{d.sessionCount}</td>
              <td className="cfg-val">{(d.messageCount || 0).toLocaleString()}</td>
              <td className="cfg-val">{(d.toolCallCount || 0).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Mémoire projet ────────────────────────────────────────────── */
function MemoryPanel({ files, projectId }) {
  const [open, setOpen] = useState('MEMORY.md'); // ouvrir MEMORY.md par défaut
  if (!files?.length) return (
    <div className="cfg-empty">
      Aucun fichier mémoire pour ce projet.
      <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 La mémoire se crée dans <code>~/.claude/projects/{projectId}/memory/</code>.
        Elle persiste entre les conversations et permet à Claude de se souvenir du contexte.
      </span>
    </div>
  );
  return (
    <div className="cfg-md-list">
      {files.map((f) => (
        <div key={f.file} className="cfg-md-item">
          <button className="cfg-md-header" onClick={() => setOpen(open === f.file ? null : f.file)}>
            <span className="cfg-md-path">{f.file}</span>
            <span className="cfg-muted" style={{ fontSize: 11 }}>
              {(f.size / 1024).toFixed(1)} Ko · {new Date(f.updatedAt).toLocaleDateString('fr-FR')}
            </span>
            <span>{open === f.file ? '▲' : '▼'}</span>
          </button>
          {open === f.file && <pre className="cfg-md-content">{f.content}</pre>}
        </div>
      ))}
    </div>
  );
}

/* ── Plans ─────────────────────────────────────────────────────── */
function PlansPanel({ plans }) {
  const [open, setOpen] = useState(null);
  if (!plans?.length) return (
    <div className="cfg-empty">
      Aucun plan sauvegardé.
      <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
        💡 Les plans sont créés via le mode Plan de Claude Code (<code>/plan</code>) et stockés dans <code>~/.claude/plans/</code>.
      </span>
    </div>
  );
  return (
    <div className="cfg-md-list">
      {plans.map((p) => (
        <div key={p.file} className="cfg-md-item">
          <button className="cfg-md-header" onClick={() => setOpen(open === p.file ? null : p.file)}>
            <span className="cfg-md-path" style={{ color: '#f59e0b' }}>{p.title}</span>
            <span className="cfg-muted" style={{ fontSize: 11 }}>
              {(p.size / 1024).toFixed(1)} Ko · {new Date(p.updatedAt).toLocaleDateString('fr-FR')}
            </span>
            <span>{open === p.file ? '▲' : '▼'}</span>
          </button>
          {open === p.file && <pre className="cfg-md-content">{p.content}</pre>}
        </div>
      ))}
    </div>
  );
}

/* ── Todos du projet ───────────────────────────────────────────── */
function TodosPanel({ todos }) {
  const [open, setOpen] = useState(null);
  if (!todos?.length) return (
    <div className="cfg-empty">Aucun todo en attente pour ce projet.</div>
  );
  const statusColor = { pending: '#f59e0b', 'in_progress': '#8b5cf6', completed: '#10b981' };
  const statusIcon  = { pending: '○', 'in_progress': '◑', completed: '●' };
  return (
    <div className="cfg-md-list">
      {todos.map((t) => (
        <div key={t.sessionId} className="cfg-md-item">
          <button className="cfg-md-header" onClick={() => setOpen(open === t.sessionId ? null : t.sessionId)}>
            <span className="cfg-md-path" style={{ fontFamily: 'monospace', fontSize: 11 }}>
              {t.sessionId.slice(0, 8)}…
            </span>
            <span className="cfg-badge" style={{ background: '#f59e0b' }}>{t.pending} en attente</span>
            <span>{open === t.sessionId ? '▲' : '▼'}</span>
          </button>
          {open === t.sessionId && (
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {t.todos.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: item.status === 'completed' ? 0.45 : 1 }}>
                  <span style={{ color: statusColor[item.status] || '#64748b', flexShrink: 0, fontSize: 13 }}>
                    {statusIcon[item.status] || '○'}
                  </span>
                  <span style={{ fontSize: 12, color: '#c0caf5', lineHeight: 1.4 }}>{item.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Tab Config Claude ─────────────────────────────────────────── */
function ClaudeConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/claude-config')
      .then((r) => r.json())
      .then((d) => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement…</span></div>
  );
  if (!config) return <div style={{ color: 'var(--error, #ef4444)', padding: 24 }}>Impossible de charger la configuration.</div>;

  const mcpCount   = config.mcpServers ? Object.keys(config.mcpServers).length : 0;
  const mdCount    = config.claudeMdFiles?.length || 0;
  const permCount  = (config.permissions?.allow?.length || 0) + (config.permissions?.deny?.length || 0);
  const memCount   = config.projectMemory?.length || 0;
  const todoCount  = config.todos?.reduce((n, t) => n + t.pending, 0) || 0;

  return (
    <div className="cfg-root">
      <div className="cfg-paths">
        <span className="cfg-muted">Projet :</span>
        <code>{config.paths?.project}</code>
        <span className="cfg-muted" style={{ marginLeft: 16 }}>ID :</span>
        <code style={{ color: '#f59e0b' }}>{config.paths?.projectId}</code>
      </div>

      <Panel title="Permissions" badge={permCount} badgeColor={permCount > 0 ? '#10b981' : '#64748b'} defaultOpen>
        <PermissionsPanel permissions={config.permissions} />
      </Panel>

      <Panel title="Activité (14 derniers jours)" badge={config.stats?.totals?.sessions || 0} badgeColor="#22d3ee">
        <StatsPanel stats={config.stats} />
      </Panel>

      <Panel title="Mémoire projet" badge={memCount} badgeColor="#8b5cf6">
        <MemoryPanel files={config.projectMemory} projectId={config.paths?.projectId} />
      </Panel>

      <Panel title="Plans" badge={config.plans?.length || 0} badgeColor="#f59e0b">
        <PlansPanel plans={config.plans} />
      </Panel>

      <Panel title="Todos en attente" badge={todoCount} badgeColor={todoCount > 0 ? '#f59e0b' : '#64748b'}>
        <TodosPanel todos={config.todos} />
      </Panel>

      <Panel title="Settings projet (.claude/settings.json)" badge="project">
        <KvTable data={config.projectSettings} skip={['hooks', 'agents', 'dashboard', 'project', 'permissions']} />
        {config.projectSettings?.agents && (
          <>
            <div className="cfg-sub-title">agents</div>
            <KvTable data={config.projectSettings.agents} />
          </>
        )}
      </Panel>

      <Panel title="Settings utilisateur (~/.claude/settings.json)" badge="user" badgeColor="#22d3ee">
        <KvTable data={config.userSettings} skip={['hooks', 'permissions']} />
      </Panel>

      {config.userLocalSettings && (
        <Panel title="Settings locaux (settings.local.json)" badge="local" badgeColor="#64748b">
          <JsonView data={config.userLocalSettings} />
        </Panel>
      )}

      <Panel title="MCP Servers" badge={mcpCount} badgeColor={mcpCount > 0 ? '#10b981' : '#64748b'}>
        <McpServers servers={config.mcpServers} />
        {config.mcpAuthCache && Object.keys(config.mcpAuthCache).length > 0 && (
          <>
            <div className="cfg-sub-title" style={{ color: '#f59e0b', marginTop: 12 }}>⚠ Nécessitent une authentification</div>
            <div className="cfg-perm-chips">
              {Object.entries(config.mcpAuthCache).map(([k]) => (
                <span key={k} className="cfg-perm-chip" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>{k}</span>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel title="Hooks" badge={config.hooks?.length || 0} badgeColor="#f59e0b">
        <HooksTable hooks={config.hooks} />
      </Panel>

      <Panel title="Fichiers CLAUDE.md" badge={mdCount} badgeColor="#8b5cf6">
        <ClaudeMdList files={config.claudeMdFiles} />
      </Panel>
    </div>
  );
}

/* ── Page principale ───────────────────────────────────────────── */
export default function Agents() {
  const [tab,     setTab]     = useState('agents'); // 'agents' | 'config'
  const [agents,  setAgents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [selected, setSelected] = useState(null); // agentId pour la modal

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((d) => { setAgents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const filtered = agents.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tools.some((t) => t.toLowerCase().includes(q))
    );
  });

  // Grouper par modèle pour l'affichage
  const groups = filtered.reduce((acc, a) => {
    const key = a.model || 'sonnet';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="ag-page">
      <div className="ag-topbar">
        <h1 style={{ margin: 0, fontSize: 22 }}>Agents & Config</h1>
        <div className="ag-tabs">
          <button className={`ag-tab${tab === 'agents' ? ' ag-tab-active' : ''}`} onClick={() => setTab('agents')}>
            🤖 Agents <span className="ag-tab-count">{agents.length}</span>
          </button>
          <button className={`ag-tab${tab === 'config' ? ' ag-tab-active' : ''}`} onClick={() => setTab('config')}>
            ⚙ Config Claude
          </button>
        </div>
      </div>

      {tab === 'agents' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <input
            className="ag-search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {tab === 'config' && <ClaudeConfig />}

      {tab === 'agents' && loading && (
        <div className="loading-placeholder">
          <div className="loading-spinner" /><span>Chargement…</span>
        </div>
      )}

      {tab === 'agents' && !loading && agents.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aucun agent trouvé</div>
          <div style={{ fontSize: 13, marginTop: 6, fontFamily: 'monospace' }}>
            .claude/agents/*.md
          </div>
        </div>
      )}

      {tab === 'agents' && !loading && filtered.length === 0 && agents.length > 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 14 }}>
          Aucun résultat pour "{search}"
        </div>
      )}

      {tab === 'agents' && Object.entries(groups).map(([model, list]) => (
        <section key={model} className="ag-section">
          <div className="ag-section-title">{model} · {list.length}</div>
          <div className="ag-grid">
            {list.map((a) => (
              <AgentCard key={a.id} agent={a} onClick={(ag) => setSelected(ag.id)} />
            ))}
          </div>
        </section>
      ))}

      {selected && (
        <AgentModal agentId={selected} onClose={() => setSelected(null)} />
      )}

      <style>{`
        .ag-page { display: flex; flex-direction: column; gap: 24px; }
        .ag-topbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }

        /* Onglets */
        .ag-tabs { display: flex; gap: 4px; }
        .ag-tab {
          background: none; border: 1px solid var(--border); border-radius: 7px;
          padding: 6px 14px; font-size: 13px; cursor: pointer; color: var(--text-secondary);
          transition: all 0.15s; display: flex; align-items: center; gap: 6px;
        }
        .ag-tab:hover { border-color: var(--accent); color: var(--text-primary); }
        .ag-tab-active { background: rgba(139,92,246,0.15); border-color: var(--accent); color: var(--text-primary); font-weight: 600; }
        .ag-tab-count { background: rgba(139,92,246,0.2); border-radius: 8px; padding: 1px 7px; font-size: 11px; font-weight: 700; color: var(--accent); }

        /* Config Claude */
        .cfg-root { display: flex; flex-direction: column; gap: 10px; }
        .cfg-paths { display: flex; align-items: center; gap: 8px; font-size: 11px; flex-wrap: wrap; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px; }
        .cfg-paths code { font-size: 11px; color: #a9b1d6; background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; }
        .cfg-muted { color: var(--text-secondary); }
        .cfg-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
        .cfg-panel-header {
          display: flex; align-items: center; gap: 8px; width: 100%;
          background: none; border: none; padding: 12px 16px; cursor: pointer;
          color: var(--text-primary); text-align: left; transition: background 0.15s;
        }
        .cfg-panel-header:hover { background: rgba(255,255,255,0.03); }
        .cfg-panel-title { font-size: 13px; font-weight: 600; flex: 1; }
        .cfg-panel-chevron { font-size: 10px; color: var(--text-secondary); }
        .cfg-panel-body { padding: 0 16px 14px; border-top: 1px solid var(--border); }
        .cfg-badge { font-size: 10px; font-weight: 700; color: white; padding: 2px 8px; border-radius: 10px; }
        .cfg-sub-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); margin: 12px 0 6px; }
        .cfg-empty { font-size: 13px; color: var(--text-secondary); padding: 12px 0; font-style: italic; }

        /* Table clé/valeur */
        .cfg-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        .cfg-table th { text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); padding: 6px 10px; border-bottom: 1px solid var(--border); }
        .cfg-table td { padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: top; }
        .cfg-key { color: var(--text-secondary); font-family: monospace; white-space: nowrap; width: 200px; }
        .cfg-val { color: var(--text-primary); word-break: break-word; }
        .cfg-inline-json { margin: 0; font-size: 11px; color: #a9b1d6; background: rgba(255,255,255,0.04); border-radius: 4px; padding: 4px 6px; white-space: pre-wrap; }
        .cfg-json { margin: 10px 0 0; font-size: 11px; color: #c0caf5; background: #141520; border-radius: 6px; padding: 12px; white-space: pre-wrap; overflow-x: auto; line-height: 1.6; }

        /* MCP */
        .cfg-mcp-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .cfg-mcp-item { background: var(--bg-secondary); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
        .cfg-mcp-name { font-size: 13px; font-weight: 700; color: #10b981; }
        .cfg-mcp-cmd code { font-size: 11px; color: #a9b1d6; background: rgba(255,255,255,0.04); padding: 3px 8px; border-radius: 4px; word-break: break-all; }
        .cfg-mcp-env { display: flex; flex-wrap: wrap; gap: 4px; }
        .cfg-env-chip { font-size: 10px; font-family: monospace; background: rgba(255,255,255,0.06); border-radius: 4px; padding: 2px 8px; color: var(--text-secondary); }

        /* Tooltip info */
        .cfg-info-wrap { position: relative; display: inline-flex; align-items: center; }
        .cfg-info-icon {
          font-size: 11px; color: var(--accent); cursor: help;
          opacity: 0.7; line-height: 1; user-select: none;
        }
        .cfg-info-icon:hover { opacity: 1; }
        .cfg-tooltip {
          position: absolute; left: 20px; top: -4px; z-index: 500;
          background: #1f2335; border: 1px solid #3b3c56;
          border-radius: 8px; padding: 10px 12px;
          min-width: 240px; max-width: 340px;
          display: flex; flex-direction: column; gap: 6px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          pointer-events: none;
        }
        .cfg-tt-label { font-size: 12px; font-weight: 700; color: var(--accent); }
        .cfg-tt-desc { font-size: 12px; color: #c0caf5; line-height: 1.5; }
        .cfg-tt-tip { font-size: 11px; color: #f59e0b; line-height: 1.4; }
        .cfg-tt-example { font-size: 11px; color: var(--text-secondary); }
        .cfg-tt-ex-label { font-weight: 600; }
        .cfg-tt-example code { font-size: 10px; background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; color: #a9b1d6; }

        /* Permissions */
        .cfg-perm-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        .cfg-perm-chip { font-size: 11px; font-family: monospace; padding: 3px 10px; border-radius: 10px; font-weight: 600; }
        .cfg-perm-allow { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); color: #10b981; }
        .cfg-perm-deny  { background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.3);  color: #ef4444; }

        /* Stats */
        .cfg-stat-kpis { display: flex; gap: 16px; flex-wrap: wrap; }
        .cfg-stat-kpi { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; text-align: center; min-width: 100px; }
        .cfg-stat-val { display: block; font-size: 22px; font-weight: 700; color: var(--accent); line-height: 1.2; }
        .cfg-stat-lbl { display: block; font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
        .cfg-stat-bars { display: flex; align-items: flex-end; gap: 3px; height: 80px; padding: 4px 0; border-bottom: 1px solid var(--border); }
        .cfg-stat-bar-wrap { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; cursor: help; }
        .cfg-stat-bar { width: 100%; min-height: 2px; background: var(--accent); border-radius: 2px 2px 0 0; opacity: 0.7; transition: opacity 0.15s; }
        .cfg-stat-bar-wrap:hover .cfg-stat-bar { opacity: 1; }
        .cfg-stat-day { font-size: 9px; color: var(--text-secondary); white-space: nowrap; }

        /* CLAUDE.md */
        .cfg-md-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .cfg-md-item { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .cfg-md-header {
          display: flex; align-items: center; gap: 10px; width: 100%;
          background: var(--bg-secondary); border: none; padding: 8px 12px;
          cursor: pointer; color: var(--text-primary); text-align: left;
        }
        .cfg-md-header:hover { background: rgba(255,255,255,0.04); }
        .cfg-md-path { flex: 1; font-size: 12px; font-family: monospace; color: #8b5cf6; }
        .cfg-md-content { margin: 0; padding: 12px 16px; font-size: 11px; line-height: 1.7; color: #c0caf5; background: #141520; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow-y: auto; }
        .ag-search {
          background: rgba(255,255,255,0.05); border: 1px solid var(--border);
          border-radius: 6px; padding: 6px 12px; font-size: 13px;
          color: var(--text-primary); width: 200px;
        }
        .ag-search:focus { outline: 1px solid var(--accent); }

        .ag-section { display: flex; flex-direction: column; gap: 10px; }
        .ag-section-title {
          font-size: 11px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.6px;
        }
        .ag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }

        .ag-card {
          background: var(--bg-card); border: 1px solid var(--border);
          border-radius: 10px; padding: 14px 16px;
          cursor: pointer; transition: border-color 0.2s;
          display: flex; flex-direction: column; gap: 8px;
        }
        .ag-card:hover { border-color: var(--accent); }
        .ag-card-header { display: flex; justify-content: space-between; align-items: center; }
        .ag-card-name { font-weight: 700; font-size: 14px; color: var(--text-primary); }
        .ag-card-model { font-size: 11px; font-weight: 600; text-transform: uppercase; }
        .ag-card-desc { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.5; }
        .ag-card-tools { display: flex; flex-wrap: wrap; gap: 4px; }
        .ag-tool-chip {
          background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2);
          border-radius: 10px; padding: 1px 8px; font-size: 10px;
          color: var(--accent); font-weight: 600; font-family: monospace;
        }

        /* Modal */
        .ag-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
        }
        .ag-modal {
          background: #1f2335; border: 1px solid #2a2b3d;
          border-radius: 14px; width: 100%; max-width: 760px;
          max-height: 85vh; display: flex; flex-direction: column;
          overflow: hidden;
        }
        .ag-modal-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 20px 24px 12px; border-bottom: 1px solid #2a2b3d; flex-shrink: 0;
        }
        .ag-modal-name { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
        .ag-modal-meta { display: flex; gap: 10px; align-items: center; }
        .ag-modal-desc { font-size: 13px; color: var(--text-secondary); margin: 0; padding: 12px 24px 0; flex-shrink: 0; line-height: 1.6; }
        .ag-close-btn {
          background: none; border: none; color: var(--text-secondary);
          cursor: pointer; font-size: 16px; padding: 4px 8px; flex-shrink: 0;
        }
        .ag-close-btn:hover { color: var(--text-primary); }
        .ag-modal-prompt-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.6px; color: var(--text-secondary);
          padding: 12px 24px 4px; flex-shrink: 0;
        }
        .ag-modal-prompt {
          flex: 1; overflow-y: auto;
          margin: 0; padding: 12px 24px 20px;
          font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
          font-size: 12px; line-height: 1.7;
          color: #c0caf5; white-space: pre-wrap; word-break: break-word;
        }
      `}</style>
    </div>
  );
}

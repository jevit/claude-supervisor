import React, { useState, useEffect } from 'react';

/* ── Champ de formulaire générique ──────────────────────────────── */
function Field({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: '#565f89' }}>{hint}</span>}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [form,     setForm]     = useState({});
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);

  // Détecte si le formulaire a été modifié par rapport aux settings sauvegardés
  const isDirty = settings != null && Object.keys(form).some((k) => {
    const saved = settings[k];
    const current = form[k];
    if (typeof current === 'boolean') return current !== !!saved;
    if (current === '' || current == null) return (saved ?? '') !== '';
    return String(current) !== String(saved ?? '');
  });

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setForm({
          defaultModel:         data.defaultModel         || '',
          maxTerminals:         data.maxTerminals         ?? '',
          heartbeatInterval:    data.heartbeatInterval    ?? '',
          maxEvents:            data.maxEvents            ?? '',
          worktreeBase:         data.worktreeBase         || '',
          dangerousModeDefault: !!data.dangerousModeDefault,
          showConflicts:        !!data.showConflicts,
          showAnalytics:        !!data.showAnalytics,
          showJournal:          !!data.showJournal,
        });
      })
      .catch(() => setError('Impossible de charger les paramètres'));
  }, []);

  const handleChange = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        defaultModel:         form.defaultModel         || undefined,
        maxTerminals:         form.maxTerminals !== '' ? Number(form.maxTerminals) : undefined,
        heartbeatInterval:    form.heartbeatInterval !== '' ? Number(form.heartbeatInterval) : undefined,
        maxEvents:            form.maxEvents !== '' ? Number(form.maxEvents) : undefined,
        worktreeBase:         form.worktreeBase         || undefined,
        dangerousModeDefault: form.dangerousModeDefault,
        showConflicts:        form.showConflicts,
        showAnalytics:        form.showAnalytics,
        showJournal:          form.showJournal,
      };
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const updated = await res.json();
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Notifier la Sidebar des nouveaux paramètres
      window.dispatchEvent(new CustomEvent('settings:updated', { detail: updated }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!settings && !error) {
    return <div className="card" style={{ textAlign: 'center', padding: 32 }}>Chargement…</div>;
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ margin: '0 0 20px' }}>Paramètres</h2>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c0caf5', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            Terminaux & Modèles
          </div>

          <Field label="Modèle par défaut" hint="Alias acceptés : sonnet, opus, haiku. Vide = modèle par défaut de Claude Code.">
            <input
              className="form-input"
              value={form.defaultModel || ''}
              onChange={(e) => handleChange('defaultModel', e.target.value)}
              placeholder="ex: claude-sonnet-4-6"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Field>

          <Field label="Nombre max de terminaux simultanés" hint="0 ou vide = illimité.">
            <input
              className="form-input"
              type="number"
              min={0}
              value={form.maxTerminals ?? ''}
              onChange={(e) => handleChange('maxTerminals', e.target.value)}
              placeholder="ex: 10"
              style={{ width: 120 }}
            />
          </Field>

          <Field label="Mode dangereux par défaut" hint="Active --dangerously-skip-permissions sur chaque nouveau terminal.">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div
                onClick={() => handleChange('dangerousModeDefault', !form.dangerousModeDefault)}
                style={{
                  width: 34, height: 18, borderRadius: 9, flexShrink: 0,
                  background: form.dangerousModeDefault ? 'rgba(239,68,68,0.7)' : '#2d3148',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                }}
              >
                <div style={{
                  position: 'absolute', top: 3, left: form.dangerousModeDefault ? 18 : 3,
                  width: 12, height: 12, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: 13, color: form.dangerousModeDefault ? '#ef4444' : '#a9b1d6' }}>
                {form.dangerousModeDefault ? '⚠ Activé' : 'Désactivé'}
              </span>
            </label>
          </Field>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c0caf5', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            Performance & Observabilité
          </div>

          <Field label="Nombre max d'événements en mémoire" hint="Défaut : 2000. Plus = plus de RAM. Nécessite redémarrage du backend.">
            <input
              className="form-input"
              type="number"
              min={100}
              max={50000}
              value={form.maxEvents ?? ''}
              onChange={(e) => handleChange('maxEvents', e.target.value)}
              placeholder="2000"
              style={{ width: 120 }}
            />
          </Field>

          <Field label="Intervalle heartbeat WebSocket (ms)" hint="Défaut : 30000. Réduit = détection de déconnexion plus rapide.">
            <input
              className="form-input"
              type="number"
              min={5000}
              max={120000}
              step={1000}
              value={form.heartbeatInterval ?? ''}
              onChange={(e) => handleChange('heartbeatInterval', e.target.value)}
              placeholder="30000"
              style={{ width: 120 }}
            />
          </Field>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c0caf5', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            Git & Worktrees
          </div>

          <Field label="Répertoire de base des worktrees (#80)" hint="Chemin absolu. Vide = ../cs-worktrees par rapport au projet. Ex: C:/worktrees">
            <input
              className="form-input"
              value={form.worktreeBase || ''}
              onChange={(e) => handleChange('worktreeBase', e.target.value)}
              placeholder="ex: C:/worktrees"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Field>
        </div>

        {/* Modules optionnels — visibilité dans la sidebar */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c0caf5', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            Modules optionnels
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            Activez les modules que vous souhaitez voir dans la navigation. Désactivés par défaut pour simplifier l'interface.
          </p>
          {[
            { key: 'showConflicts', label: 'Conflits & Locks', desc: 'Détection de conflits de fichiers et table des locks actifs.' },
            { key: 'showAnalytics', label: 'Analytics',        desc: 'Métriques et statistiques des sessions.' },
            { key: 'showJournal',   label: 'Journal',          desc: 'Journal chronologique de tous les événements système.' },
          ].map(({ key, label, desc }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div
                onClick={() => handleChange(key, !form[key])}
                style={{
                  width: 34, height: 18, borderRadius: 9, flexShrink: 0, marginTop: 2,
                  background: form[key] ? 'rgba(139,92,246,0.7)' : '#2d3148',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                }}
              >
                <div style={{
                  position: 'absolute', top: 3, left: form[key] ? 18 : 3,
                  width: 12, height: 12, borderRadius: '50%', background: 'white',
                  transition: 'left 0.2s',
                }} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: form[key] ? '#c0caf5' : '#565f89', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#565f89' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 7,
              padding: '9px 20px', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 700, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Enregistrement…' : '💾 Enregistrer'}
          </button>
          {isDirty && !saving && (
            <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              ● Modifications non sauvegardées
            </span>
          )}
          {saved && !isDirty && (
            <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>
              ✓ Paramètres sauvegardés
            </span>
          )}
        </div>
      </form>

      {/* Token d'authentification (#68) */}
      <div className="card" style={{ marginTop: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: '#a9b1d6', marginBottom: 12, fontSize: 14 }}>Authentification</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Si le backend est configuré avec un token (<code style={{ fontFamily: 'monospace', fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>authToken</code> dans settings.json),
          saisissez-le ici. Il sera envoyé automatiquement dans toutes les requêtes API.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="form-input"
            type="password"
            placeholder="Token (vide = pas d'auth)"
            defaultValue={(() => { try { return localStorage.getItem('cs:auth-token') || ''; } catch { return ''; } })()}
            onChange={(e) => {
              const val = e.target.value.trim();
              try {
                if (val) localStorage.setItem('cs:auth-token', val);
                else localStorage.removeItem('cs:auth-token');
              } catch {}
            }}
            style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 300 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sauvegardé automatiquement dans le navigateur.</span>
        </div>
      </div>

      {/* Configuration MCP (#58) */}
      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 700, color: '#a9b1d6', marginBottom: 12, fontSize: 14 }}>Configuration MCP</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Pour connecter Claude Code au superviseur, créez un fichier <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>.mcp.json</code> à la racine de votre projet :
        </p>
        <div style={{ position: 'relative' }}>
          <pre style={{ background: '#1a1b26', borderRadius: 6, padding: '12px 14px', fontSize: 12, overflowX: 'auto', margin: 0, color: '#a9b1d6', lineHeight: 1.5 }}>{`{
  "mcpServers": {
    "claude-supervisor": {
      "command": "node",
      "args": ["${window.location.hostname === 'localhost' ? '/chemin/vers/' : ''}claude-supervisor/mcp/supervisor-mcp.js"],
      "env": {
        "SUPERVISOR_URL": "http://localhost:3001"
      }
    }
  }
}`}</pre>
          <button
            onClick={() => navigator.clipboard.writeText(`{
  "mcpServers": {
    "claude-supervisor": {
      "command": "node",
      "args": ["/chemin/vers/claude-supervisor/mcp/supervisor-mcp.js"],
      "env": {
        "SUPERVISOR_URL": "http://localhost:3001"
      }
    }
  }
}`).catch(() => {})}
            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 4, color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: '3px 9px' }}
          >
            📋 Copier
          </button>
        </div>
      </div>

      {/* Infos sur l'installation */}
      <div className="card" style={{ marginTop: 20, fontSize: 12, color: '#64748b' }}>
        <div style={{ fontWeight: 700, color: '#a9b1d6', marginBottom: 8 }}>À propos</div>
        <div>Les paramètres sont persistés dans <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>backend/.claude/settings.json</code>.</div>
        <div style={{ marginTop: 4 }}>Certains paramètres (maxEvents, heartbeatInterval) nécessitent un redémarrage du backend pour être pris en compte.</div>
        {settings && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', color: '#8b5cf6' }}>Voir le JSON complet</summary>
            <pre style={{ marginTop: 8, background: '#1a1b26', borderRadius: 6, padding: '10px 12px', fontSize: 11, overflowX: 'auto', maxHeight: 200 }}>
              {JSON.stringify(settings, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <style>{`
        .form-input { padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 13px; width: 100%; box-sizing: border-box; outline: none; }
        .form-input:focus { border-color: var(--accent); }
      `}</style>
    </div>
  );
}

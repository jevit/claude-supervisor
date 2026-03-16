import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState(''); // session ID ou 'all'
  const [compose,  setCompose]  = useState(false);
  const [form,     setForm]     = useState({ from: 'dashboard', to: '', content: '', type: 'info' });
  const [sending,  setSending]  = useState(false);

  const fetchData = useCallback(async () => {
    const [msgs, sess] = await Promise.all([
      fetch('/api/messages?limit=200').then((r) => r.json()).catch(() => []),
      fetch('/api/sessions').then((r) => r.json()).catch(() => []),
    ]);
    setMessages(Array.isArray(msgs) ? msgs : []);
    setSessions(Array.isArray(sess) ? sess : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useWebSocket(useCallback((ev) => { if (ev.startsWith('message:')) fetchData(); }, [fetchData]));

  const filtered = filter
    ? messages.filter((m) => m.from === filter || m.to === filter)
    : messages;

  // Grouper par conversation (paire from/to)
  const sessionNames = Object.fromEntries(sessions.map((s) => [s.id, s.name || s.id.slice(0, 8)]));

  const getName = (id) => id === 'dashboard' || id === 'system' ? id : (sessionNames[id] || id.slice(0, 10) + '…');

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.to || !form.content.trim()) return;
    setSending(true);
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => {});
    setSending(false);
    setForm((f) => ({ ...f, content: '' }));
    setCompose(false);
    fetchData();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Messages inter-sessions</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '4px 0 0' }}>
            {filtered.length} message{filtered.length !== 1 ? 's' : ''}
            {filter && ` (filtré : ${getName(filter)})`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {filter && (
            <button onClick={() => setFilter('')}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
              ✕ Voir tous
            </button>
          )}
          <button
            onClick={() => setCompose((v) => !v)}
            style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            {compose ? 'Annuler' : '+ Nouveau message'}
          </button>
        </div>
      </div>

      {/* Formulaire de composition */}
      {compose && (
        <div className="card" style={{ marginBottom: 16 }}>
          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>De</label>
                <input value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 9px', color: 'var(--text-primary)', fontSize: 12 }}
                  placeholder="dashboard" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>À</label>
                <select value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 9px', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
                  <option value="">— Choisir une session —</option>
                  <option value="all">📡 Toutes les sessions</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name || s.id.slice(0, 12)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 9px', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}>
                  <option value="info">info</option>
                  <option value="task">task</option>
                  <option value="error">error</option>
                  <option value="result">result</option>
                </select>
              </div>
            </div>
            <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={3} placeholder="Contenu du message…"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 9px', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', fontFamily: 'monospace' }} />
            <button type="submit" disabled={sending || !form.to || !form.content.trim()}
              style={{ alignSelf: 'flex-start', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {sending ? 'Envoi…' : '✉ Envoyer'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement…</span></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 32 }}>
          Aucun message{filter ? ' pour ce filtre' : ''}. Utilisez le MessageBus via MCP ou le formulaire.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[...filtered].reverse().map((msg) => {
            const typeColor = { info: '#3b82f6', task: '#8b5cf6', error: '#ef4444', result: '#10b981' }[msg.type] || '#565f89';
            const isRead = msg.readAt;
            return (
              <div key={msg.id} className="msg-row" style={{ opacity: isRead ? 0.7 : 1 }}>
                <div className="msg-meta">
                  <span className="msg-from" onClick={() => setFilter(msg.from === filter ? '' : msg.from)}>
                    {getName(msg.from)}
                  </span>
                  <span style={{ color: '#565f89', fontSize: 11 }}>→</span>
                  <span className="msg-to" onClick={() => setFilter(msg.to === filter ? '' : msg.to)}>
                    {getName(msg.to)}
                  </span>
                  <span className="msg-type" style={{ color: typeColor }}>{msg.type}</span>
                  <span className="msg-time">{new Date(msg.timestamp).toLocaleTimeString('fr-FR')}</span>
                  {!isRead && <span style={{ fontSize: 9, background: '#3b82f6', color: 'white', borderRadius: 6, padding: '1px 5px', fontWeight: 700 }}>NEW</span>}
                </div>
                <div className="msg-content">{msg.content}</div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .msg-row { padding: 10px 14px; border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .msg-row:hover { background: rgba(139,92,246,0.04); }
        .msg-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
        .msg-from, .msg-to { font-size: 12px; font-weight: 600; font-family: monospace; color: var(--accent); cursor: pointer; background: rgba(139,92,246,0.08); border-radius: 4px; padding: 1px 7px; }
        .msg-from:hover, .msg-to:hover { background: rgba(139,92,246,0.2); }
        .msg-type { font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; }
        .msg-time { font-size: 11px; color: #565f89; font-family: monospace; }
        .msg-content { font-size: 13px; color: var(--text-primary); white-space: pre-wrap; font-family: monospace; }
      `}</style>
    </div>
  );
}

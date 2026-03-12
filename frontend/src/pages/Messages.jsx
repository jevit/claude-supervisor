import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../services/websocket';

const TYPE_COLORS = {
  info: 'var(--accent)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  request: 'var(--success)',
};

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [newMsg, setNewMsg] = useState({ to: 'all', type: 'info', content: '' });

  const fetchData = useCallback(() => {
    Promise.all([
      fetch('/api/messages?limit=100').then((r) => r.json()),
      fetch('/api/sessions').then((r) => r.json()),
    ])
      .then(([m, s]) => { setMessages(m); setSessions(s); setLoading(false); })
      .catch(console.error);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useWebSocket(useCallback((event) => {
    if (event === 'message:received') fetchData();
  }, [fetchData]));

  const handleSend = () => {
    if (!newMsg.content) return;
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'dashboard', ...newMsg }),
    })
      .then(() => { setNewMsg({ to: 'all', type: 'info', content: '' }); setShowCompose(false); fetchData(); })
      .catch(console.error);
  };

  const handleMarkRead = (id) => {
    fetch(`/api/messages/${id}/read`, { method: 'PUT' })
      .then(() => fetchData())
      .catch(console.error);
  };

  const getSessionName = (id) => {
    if (id === 'all') return 'Toutes les sessions';
    if (id === 'dashboard' || id === 'system') return id;
    const session = sessions.find((s) => s.id === id);
    return session ? session.name : id.substring(0, 8);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Messages</h1>
        <button className="btn-primary" onClick={() => setShowCompose(!showCompose)}>
          {showCompose ? 'Annuler' : 'Nouveau message'}
        </button>
      </div>

      {showCompose && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="msg-form">
            <div className="msg-form-row">
              <div>
                <label className="form-label">Destinataire</label>
                <select className="form-input" value={newMsg.to}
                  onChange={(e) => setNewMsg({ ...newMsg, to: e.target.value })}>
                  <option value="all">Toutes les sessions</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Type</label>
                <select className="form-input" value={newMsg.type}
                  onChange={(e) => setNewMsg({ ...newMsg, type: e.target.value })}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="request">Request</option>
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Message</label>
              <textarea className="form-input form-textarea" value={newMsg.content}
                placeholder="Contenu du message..."
                onChange={(e) => setNewMsg({ ...newMsg, content: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={handleSend}>Envoyer</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-placeholder"><div className="loading-spinner" /><span>Chargement...</span></div>
      ) : messages.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-secondary)' }}>Aucun message.</div>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className={`card msg-card ${msg.read ? '' : 'msg-unread'}`}>
            <div className="msg-header">
              <div className="msg-meta">
                <span className="msg-type" style={{ color: TYPE_COLORS[msg.type] }}>{msg.type}</span>
                <span className="msg-from">{getSessionName(msg.from)}</span>
                <span className="msg-arrow">→</span>
                <span className="msg-to">{getSessionName(msg.to)}</span>
              </div>
              <div className="msg-actions">
                {!msg.read && (
                  <button className="btn-small" onClick={() => handleMarkRead(msg.id)}>Marquer lu</button>
                )}
                <span className="msg-time">
                  {new Date(msg.timestamp).toLocaleString('fr-FR')}
                </span>
              </div>
            </div>
            <p className="msg-content">{msg.content}</p>
          </div>
        ))
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .btn-primary { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .btn-primary:hover { background: var(--accent-hover); }
        .msg-form { display: flex; flex-direction: column; gap: 12px; }
        .msg-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .form-input { width: 100%; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 13px; }
        .form-textarea { min-height: 60px; resize: vertical; font-family: inherit; }
        .msg-card { margin-bottom: 8px; }
        .msg-unread { border-left: 3px solid var(--accent); }
        .msg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
        .msg-meta { display: flex; align-items: center; gap: 6px; font-size: 13px; }
        .msg-type { font-weight: 600; text-transform: uppercase; font-size: 11px; }
        .msg-from, .msg-to { color: var(--text-secondary); }
        .msg-arrow { color: var(--border); }
        .msg-actions { display: flex; align-items: center; gap: 8px; }
        .msg-time { font-size: 11px; color: var(--text-secondary); }
        .msg-content { font-size: 14px; color: var(--text-primary); white-space: pre-wrap; }
        .btn-small { background: var(--bg-primary); color: var(--text-secondary); border: 1px solid var(--border); padding: 4px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
      `}</style>
    </div>
  );
}

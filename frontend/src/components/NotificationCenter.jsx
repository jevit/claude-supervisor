import React, { useState, useEffect, useCallback } from 'react';
import Toast from './Toast';
import { useWebSocket } from '../services/websocket';

const SEVERITY_COLORS = {
  info: 'var(--accent)',
  warning: 'var(--warning)',
  error: 'var(--error)',
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Charger les notifications et le compteur
  useEffect(() => {
    fetch('/api/notifications?limit=30')
      .then((r) => r.json())
      .then(setNotifications)
      .catch(console.error);
    fetch('/api/notifications/count')
      .then((r) => r.json())
      .then((d) => setUnreadCount(d.unread))
      .catch(console.error);
  }, []);

  // Ecouter les nouvelles notifications en temps reel
  useWebSocket(useCallback((event, data) => {
    if (event === 'notification:new' && data) {
      setNotifications((prev) => [data, ...prev].slice(0, 30));
      setUnreadCount((c) => c + 1);
      setToasts((prev) => [...prev, data]);
      // Notification sonore pour warning et error
      if (data.severity === 'error' || data.severity === 'warning') {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = data.severity === 'error' ? 440 : 600;
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch { /* son non disponible */ }
      }
    }
  }, []));

  const handleMarkAllRead = () => {
    fetch('/api/notifications/read-all', { method: 'PUT' })
      .then(() => {
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      })
      .catch(console.error);
  };

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <>
      {/* Bouton dans la sidebar */}
      <div className="notification-trigger" onClick={() => setShowPanel(!showPanel)}>
        <span className="notification-icon">&#128276;</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </div>

      {/* Panel de notifications */}
      {showPanel && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button className="mark-read-btn" onClick={handleMarkAllRead}>
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="no-notifications">Aucune notification</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`notification-item ${n.read ? '' : 'unread'}`}>
                  <div className="notification-dot" style={{ background: SEVERITY_COLORS[n.severity] || SEVERITY_COLORS.info }} />
                  <div className="notification-body">
                    <div className="notification-title">{n.title}</div>
                    <div className="notification-msg">{n.message}</div>
                    <div className="notification-time">{formatTime(n.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Toasts (coin superieur droit) */}
      <div className="toast-container">
        {toasts.slice(-5).map((t) => (
          <Toast key={t.id} notification={t} onDismiss={() => dismissToast(t.id)} />
        ))}
      </div>

      <style>{`
        .notification-trigger {
          position: relative;
          padding: 10px 20px;
          cursor: pointer;
          color: var(--text-secondary);
          transition: color 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .notification-trigger:hover { color: var(--text-primary); }
        .notification-icon { font-size: 16px; }
        .notification-badge {
          background: var(--error);
          color: white;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 10px;
          min-width: 16px;
          text-align: center;
        }
        .notification-panel {
          position: fixed;
          left: 240px;
          top: 0;
          width: 320px;
          height: 100vh;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border);
          z-index: 100;
          overflow-y: auto;
        }
        .notification-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          background: var(--bg-secondary);
        }
        .mark-read-btn {
          background: none;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
        }
        .mark-read-btn:hover { color: var(--text-primary); border-color: var(--accent); }
        .notification-list { padding: 8px 0; }
        .no-notifications { padding: 24px 16px; color: var(--text-secondary); font-size: 13px; }
        .notification-item {
          display: flex;
          gap: 10px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--border);
        }
        .notification-item.unread { background: rgba(139, 92, 246, 0.04); }
        .notification-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }
        .notification-body { flex: 1; min-width: 0; }
        .notification-title { font-size: 13px; font-weight: 600; }
        .notification-msg { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
        .notification-time { font-size: 11px; color: var(--border); margin-top: 4px; }
        .toast-container {
          position: fixed;
          top: 16px;
          right: 16px;
          width: 320px;
          z-index: 200;
        }
      `}</style>
    </>
  );
}

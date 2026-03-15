import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

const TYPE_STYLES = {
  success: { bg: '#1a1d27', border: 'rgba(16,185,129,0.4)',  accent: '#10b981', icon: '✓' },
  error:   { bg: '#1a1d27', border: 'rgba(239,68,68,0.4)',   accent: '#ef4444', icon: '✕' },
  warning: { bg: '#1a1d27', border: 'rgba(245,158,11,0.4)',  accent: '#f59e0b', icon: '⚠' },
  info:    { bg: '#1a1d27', border: 'rgba(139,92,246,0.4)',  accent: '#8b5cf6', icon: 'ℹ' },
};

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 8, pointerEvents: 'none',
    }}>
      {toasts.map((t) => {
        const s = TYPE_STYLES[t.type] || TYPE_STYLES.info;
        return (
          <div key={t.id} style={{
            pointerEvents: 'all',
            display: 'flex', alignItems: 'center', gap: 10,
            background: s.bg, border: `1px solid ${s.border}`,
            borderLeft: `3px solid ${s.accent}`,
            borderRadius: 8, padding: '10px 14px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            fontSize: 13, color: '#e4e6f0',
            animation: 'toast-in 0.18s ease',
            minWidth: 220, maxWidth: 380,
          }}>
            <span style={{ color: s.accent, fontWeight: 700, flexShrink: 0, fontSize: 14 }}>{s.icon}</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              style={{ background: 'none', border: 'none', color: '#565f89', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1, flexShrink: 0 }}
              aria-label="Fermer"
            >✕</button>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

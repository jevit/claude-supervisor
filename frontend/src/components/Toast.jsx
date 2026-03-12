import React, { useEffect, useState } from 'react';

const SEVERITY_STYLES = {
  info: { bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.4)', color: 'var(--accent)' },
  warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', color: 'var(--warning)' },
  error: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', color: 'var(--error)' },
};

export default function Toast({ notification, onDismiss }) {
  const [visible, setVisible] = useState(true);
  const style = SEVERITY_STYLES[notification.severity] || SEVERITY_STYLES.info;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`toast ${visible ? 'toast-enter' : 'toast-exit'}`}
      style={{
        background: style.bg,
        borderLeft: `3px solid ${style.border}`,
      }}
    >
      <div className="toast-title" style={{ color: style.color }}>
        {notification.title}
      </div>
      <div className="toast-message">{notification.message}</div>
      <button className="toast-close" onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}>
        &times;
      </button>
      <style>{`
        .toast {
          position: relative;
          padding: 12px 36px 12px 16px;
          border-radius: 8px;
          margin-bottom: 8px;
          transition: opacity 0.3s, transform 0.3s;
        }
        .toast-enter { opacity: 1; transform: translateX(0); }
        .toast-exit { opacity: 0; transform: translateX(100px); }
        .toast-title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
        .toast-message { font-size: 12px; color: var(--text-secondary); }
        .toast-close {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 18px;
          cursor: pointer;
          line-height: 1;
        }
      `}</style>
    </div>
  );
}

import React from 'react';

/**
 * Bandeau d'etat de connexion WebSocket.
 * Visible uniquement quand la connexion est perdue.
 */
export default function ConnectionBanner({ state }) {
  if (state === 'connected') return null;

  const isConnecting = state === 'connecting';

  return (
    <div className={`connection-banner ${isConnecting ? 'connecting' : 'disconnected'}`}>
      <span className="connection-dot" />
      {isConnecting ? 'Connexion au serveur...' : 'Connexion perdue — reconnexion en cours...'}
      <style>{`
        .connection-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 16px;
        }
        .connection-banner.connecting {
          background: rgba(245, 158, 11, 0.12);
          color: var(--warning);
          border: 1px solid rgba(245, 158, 11, 0.25);
        }
        .connection-banner.disconnected {
          background: rgba(239, 68, 68, 0.12);
          color: var(--error);
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
        .connection-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .connecting .connection-dot {
          background: var(--warning);
          animation: pulse 1.5s ease-in-out infinite;
        }
        .disconnected .connection-dot {
          background: var(--error);
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

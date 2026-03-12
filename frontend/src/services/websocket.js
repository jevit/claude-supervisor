import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Hook WebSocket avec reconnexion automatique et etat de connexion.
 *
 * @param {function} onMessage - Callback (event, data) pour chaque message recu
 * @returns {{ connectionState: string }} Etat de la connexion
 */
export function useWebSocket(onMessage) {
  const [connectionState, setConnectionState] = useState('connecting');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const closingRef = useRef(false);
  const onMessageRef = useRef(onMessage);

  // Garder la reference au callback a jour sans recréer la connexion
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (closingRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;
    setConnectionState('connecting');

    ws.onopen = () => {
      setConnectionState('connected');
      reconnectDelayRef.current = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const { event: evt, data } = JSON.parse(event.data);
        onMessageRef.current(evt, data);
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    };

    ws.onclose = () => {
      if (closingRef.current) return;
      setConnectionState('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose sera appele apres, pas besoin d'agir ici
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (closingRef.current || reconnectTimerRef.current) return;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, reconnectDelayRef.current);

    // Backoff exponentiel (max 30s)
    reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
  }, [connect]);

  useEffect(() => {
    closingRef.current = false;
    connect();

    return () => {
      closingRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connectionState };
}

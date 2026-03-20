import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * WebSocket singleton partagé (#50).
 *
 * Une seule connexion WS est maintenue pour toute l'application.
 * Tous les composants qui appellent useWebSocket() s'abonnent à ce singleton.
 * Avantage : N composants = 1 seule connexion au lieu de N.
 */

const WS_RECONNECT_MIN = 1000;
const WS_RECONNECT_MAX = 30000;

// Singleton WebSocket
let _ws             = null;
let _state          = 'disconnected';
let _reconnectTimer = null;
let _reconnectDelay = WS_RECONNECT_MIN;
let _closing        = false;

// Ensembles d'abonnés
const _msgSubscribers   = new Set(); // (evt, data) => void
const _stateSubscribers = new Set(); // (state) => void
const _pauseSubscribers = new Set(); // (paused: boolean) => void

// État pause — persisté dans localStorage
let _paused = localStorage.getItem('live-paused') === 'true';

export function setLivePaused(val) {
  _paused = val;
  localStorage.setItem('live-paused', val);
  for (const cb of _pauseSubscribers) {
    try { cb(val); } catch {}
  }
}

export function isLivePaused() { return _paused; }

function _notifyMessage(evt, data) {
  if (_paused) return;
  for (const cb of _msgSubscribers) {
    try { cb(evt, data); } catch {}
  }
}

function _setState(s) {
  _state = s;
  for (const cb of _stateSubscribers) {
    try { cb(s); } catch {}
  }
}

function _scheduleReconnect() {
  if (_closing || _reconnectTimer) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _connect();
  }, _reconnectDelay);
  _reconnectDelay = Math.min(_reconnectDelay * 2, WS_RECONNECT_MAX);
}

function _connect() {
  if (_closing || _ws) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  _ws = ws;
  _setState('connecting');

  ws.onopen = () => {
    _reconnectDelay = WS_RECONNECT_MIN;
    _setState('connected');
  };

  ws.onmessage = (event) => {
    try {
      const { event: evt, data } = JSON.parse(event.data);
      _notifyMessage(evt, data);
      // Événement global pour les listeners passifs (ex: window.addEventListener('ws:message'))
      window.dispatchEvent(new CustomEvent('ws:message', { detail: { event: evt, data } }));
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };

  ws.onclose = () => {
    _ws = null;
    if (_closing) return;
    _setState('disconnected');
    _scheduleReconnect();
  };

  ws.onerror = () => { /* onclose sera appelé ensuite */ };
}

function _ensureConnected() {
  if (!_ws && !_reconnectTimer && !_closing) {
    _connect();
  }
}

function _send(type, data) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ type, data }));
    return true;
  }
  return false;
}

/**
 * Hook WebSocket partagé avec reconnexion automatique.
 *
 * Tous les composants utilisant ce hook partagent une seule connexion WS.
 *
 * @param {function} onMessage - Callback (evt, data) pour chaque message reçu
 * @returns {{ connectionState: string, send: function }}
 */
/**
 * Envoie l'input d'un terminal via WebSocket (sans overhead HTTP).
 * Retourne false si le WS n'est pas dispo (le caller peut fallback sur fetch).
 */
export function sendTerminalInput(terminalId, data) {
  return _send('terminal:input', { terminalId, data });
}

export function useWebSocket(onMessage) {
  const [connectionState, setConnectionState] = useState(_state);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    _closing = false;
    _ensureConnected();

    // S'abonner aux messages
    const msgHandler = (evt, data) => {
      if (onMessageRef.current) onMessageRef.current(evt, data);
    };
    _msgSubscribers.add(msgHandler);

    // S'abonner aux changements d'état de connexion
    const stateHandler = (s) => setConnectionState(s);
    _stateSubscribers.add(stateHandler);

    // Synchroniser l'état initial
    setConnectionState(_state);

    return () => {
      _msgSubscribers.delete(msgHandler);
      _stateSubscribers.delete(stateHandler);
      // Ne pas fermer la connexion singleton — d'autres composants peuvent l'utiliser
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback((type, data) => _send(type, data), []);

  return { connectionState, send };
}

/**
 * Hook pour lire/écrire l'état pause de l'activité live.
 * @returns {{ paused: boolean, setPaused: (val: boolean) => void }}
 */
export function useLivePause() {
  const [paused, setPausedState] = useState(_paused);

  useEffect(() => {
    const handler = (val) => setPausedState(val);
    _pauseSubscribers.add(handler);
    return () => _pauseSubscribers.delete(handler);
  }, []);

  const setPaused = useCallback((val) => setLivePaused(val), []);

  return { paused, setPaused };
}

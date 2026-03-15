import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// WebSocket mock global
class MockWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._closed = false;
    MockWebSocket.instances.push(this);
    // Simuler la connexion asynchrone
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data) { this._sent = (this._sent || []).concat(data); }
  close() { this._closed = true; this.readyState = MockWebSocket.CLOSING; this.onclose?.(); }

  // Helpers de test
  _emit(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    // Réinitialiser le singleton entre chaque test
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('établit une connexion WebSocket au montage', async () => {
    const { useWebSocket } = await import('../../services/websocket');
    renderHook(() => useWebSocket(vi.fn()));
    await act(async () => {});
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
  });

  it('appelle le callback quand un message est reçu', async () => {
    const { useWebSocket } = await import('../../services/websocket');
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(onMessage));

    await act(async () => {});
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws._emit({ event: 'terminal:output', data: { terminalId: 't1', data: 'hello' } });
    });

    expect(onMessage).toHaveBeenCalledWith('terminal:output', { terminalId: 't1', data: 'hello' });
  });

  it('expose connectionState', async () => {
    const { useWebSocket } = await import('../../services/websocket');
    const { result } = renderHook(() => useWebSocket(vi.fn()));
    await act(async () => {});
    expect(['connecting', 'connected', 'disconnected']).toContain(result.current.connectionState);
  });

  it('n\'appelle pas le callback après démontage', async () => {
    const { useWebSocket } = await import('../../services/websocket');
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    await act(async () => {});
    unmount();

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws._emit({ event: 'session:updated', data: {} });
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('expose une fonction send', async () => {
    const { useWebSocket } = await import('../../services/websocket');
    const { result } = renderHook(() => useWebSocket(vi.fn()));
    await act(async () => {});
    expect(typeof result.current.send).toBe('function');
  });

  it('dispatch un événement global ws:message', async () => {
    const { useWebSocket } = await import('../../services/websocket');
    renderHook(() => useWebSocket(vi.fn()));
    await act(async () => {});

    const globalSpy = vi.fn();
    window.addEventListener('ws:message', globalSpy);

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws._emit({ event: 'context:set', data: { key: 'foo' } });
    });

    expect(globalSpy).toHaveBeenCalledOnce();
    expect(globalSpy.mock.calls[0][0].detail).toEqual({ event: 'context:set', data: { key: 'foo' } });

    window.removeEventListener('ws:message', globalSpy);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from '../../services/api';

// Helper : crée une Response mock
function mockResponse(body, { status = 200, ok = true } = {}) {
  const json = async () => body;
  const clone = () => ({ json });
  const text = async () => JSON.stringify(body);
  return { ok, status, json, clone, text };
}

describe('apiFetch', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // Vider le localStorage entre chaque test
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Headers ────────────────────────────────────────────────────────

  it('ajoute Content-Type application/json', async () => {
    fetchMock.mockResolvedValue(mockResponse({}));
    await apiFetch('/api/test');
    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
  });

  it('n\'ajoute pas X-Supervisor-Token si localStorage vide', async () => {
    fetchMock.mockResolvedValue(mockResponse({}));
    await apiFetch('/api/test');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-Supervisor-Token']).toBeUndefined();
  });

  it('ajoute X-Supervisor-Token si token dans localStorage', async () => {
    localStorage.setItem('cs:auth-token', 'my-secret-token');
    fetchMock.mockResolvedValue(mockResponse({}));
    await apiFetch('/api/test');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-Supervisor-Token']).toBe('my-secret-token');
  });

  it('ne surcharge pas les headers personnalisés', async () => {
    fetchMock.mockResolvedValue(mockResponse({}));
    await apiFetch('/api/test', { headers: { 'X-Custom': 'value' } });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-Custom']).toBe('value');
  });

  it('les headers options écrasent Content-Type si précisé', async () => {
    fetchMock.mockResolvedValue(mockResponse({}));
    await apiFetch('/api/test', { headers: { 'Content-Type': 'text/plain' } });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('text/plain');
  });

  // ── Réponse OK ────────────────────────────────────────────────────

  it('retourne la réponse pour un statut 200', async () => {
    const response = mockResponse({ data: 'ok' });
    fetchMock.mockResolvedValue(response);
    const result = await apiFetch('/api/test');
    expect(result).toBe(response);
  });

  it('passe les options (method, body) à fetch', async () => {
    fetchMock.mockResolvedValue(mockResponse({}));
    await apiFetch('/api/test', { method: 'POST', body: '{"key":"val"}' });
    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'POST',
      body: '{"key":"val"}',
    }));
  });

  // ── Erreurs HTTP ──────────────────────────────────────────────────

  it('dispatch api:error pour un statut 404', async () => {
    fetchMock.mockResolvedValue(mockResponse({ error: 'Non trouvé' }, { status: 404, ok: false }));
    const eventSpy = vi.fn();
    window.addEventListener('api:error', eventSpy);

    await apiFetch('/api/missing');

    expect(eventSpy).toHaveBeenCalledOnce();
    const detail = eventSpy.mock.calls[0][0].detail;
    expect(detail.url).toBe('/api/missing');
    expect(detail.status).toBe(404);
    expect(detail.message).toBe('Non trouvé');

    window.removeEventListener('api:error', eventSpy);
  });

  it('dispatch api:error avec "HTTP 500" si pas de body.error', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 500,
      clone: () => ({ json: async () => { throw new Error(); } }),
    });
    const eventSpy = vi.fn();
    window.addEventListener('api:error', eventSpy);

    await apiFetch('/api/broken');

    const detail = eventSpy.mock.calls[0][0].detail;
    expect(detail.message).toBe('HTTP 500');

    window.removeEventListener('api:error', eventSpy);
  });

  it('retourne la réponse même pour un 4xx (pas de throw)', async () => {
    const response = mockResponse({ error: 'Forbidden' }, { status: 403, ok: false });
    fetchMock.mockResolvedValue(response);
    const result = await apiFetch('/api/secured');
    expect(result).toBe(response);
  });

  // ── Erreurs réseau ────────────────────────────────────────────────

  it('throw si erreur réseau (fetch rejette)', async () => {
    fetchMock.mockRejectedValue(new Error('NetworkError'));
    await expect(apiFetch('/api/test')).rejects.toThrow('Réseau inaccessible');
  });

  it('dispatch api:error avec status 0 sur erreur réseau', async () => {
    fetchMock.mockRejectedValue(new Error('Connection refused'));
    const eventSpy = vi.fn();
    window.addEventListener('api:error', eventSpy);

    await apiFetch('/api/test').catch(() => {});

    const detail = eventSpy.mock.calls[0][0].detail;
    expect(detail.status).toBe(0);
    expect(detail.url).toBe('/api/test');

    window.removeEventListener('api:error', eventSpy);
  });
});

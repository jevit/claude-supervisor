/**
 * apiFetch — wrapper centralisé pour les requêtes API (#44).
 *
 * Avantages :
 * - Ajoute automatiquement le header X-Supervisor-Token si configuré (#68)
 * - Dispatch un événement global 'api:error' si status >= 400 ou réseau inaccessible
 * - Retourne la réponse JSON ou lance une erreur avec le message d'erreur
 *
 * Usage :
 *   const data = await apiFetch('/api/terminals');
 *   await apiFetch('/api/terminals/123', { method: 'DELETE' });
 */

// Token stocké en localStorage sous 'cs:auth-token' (configuré dans Settings)
function getToken() {
  try { return localStorage.getItem('cs:auth-token') || ''; } catch { return ''; }
}

function dispatchError(url, status, message) {
  window.dispatchEvent(new CustomEvent('api:error', { detail: { url, status, message } }));
}

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { 'X-Supervisor-Token': token } : {}),
  };

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    const msg = `Réseau inaccessible : ${err.message}`;
    dispatchError(url, 0, msg);
    throw new Error(msg);
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const body = await response.clone().json();
      if (body.error) errMsg = body.error;
    } catch {}
    dispatchError(url, response.status, errMsg);
    // Ne pas throw automatiquement — laisser le caller décider
    // Pour l'utilisation côté frontend, retourner la response pour que le caller puisse
    // appeler .json() si nécessaire (ex: lire le message d'erreur détaillé)
  }

  return response;
}

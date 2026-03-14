import { test, expect, request as playwrightRequest } from '@playwright/test';

// Contexte API direct sur le backend (127.0.0.1 pour eviter le delai IPv6 Windows)
let apiContext;
test.beforeAll(async () => {
  apiContext = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
});
test.afterAll(async () => {
  await apiContext.dispose();
});

async function waitForPage(page, path, selector, timeout = 10000) {
  await page.goto(path);
  await page.waitForSelector(selector, { timeout });
  await page.waitForTimeout(500);
}

// ─────────────────────────────────────────────────
// Page Timeline
// ─────────────────────────────────────────────────
test.describe('Page Timeline', () => {
  test('affiche le titre et les filtres', async ({ page }) => {
    await waitForPage(page, '/timeline', '.main-content h1');
    await expect(page.locator('.main-content h1')).toContainText('Timeline');
    await expect(page.locator('.timeline-filters')).toBeVisible();
    // Deux selects (type + session) et le bouton replay
    const selects = page.locator('.timeline-select');
    await expect(selects).toHaveCount(2);
    await expect(page.locator('.replay-btn')).toBeVisible();
  });

  test('le filtre par type fonctionne', async ({ page }) => {
    await waitForPage(page, '/timeline', '.timeline-filters');
    const typeSelect = page.locator('.timeline-select').first();
    // Doit contenir "Tous les evenements" comme option par defaut
    await expect(typeSelect).toContainText('Tous les evenements');
  });

  test('affiche des evenements ou un message vide', async ({ page }) => {
    await waitForPage(page, '/timeline', '.main-content h1');
    // Soit des evenements soit le message vide
    const hasEvents = await page.locator('.timeline-event').count() > 0;
    const hasEmpty = await page.locator('text=Aucun evenement').count() > 0;
    expect(hasEvents || hasEmpty).toBe(true);
  });
});

// ─────────────────────────────────────────────────
// Page Terminaux
// ─────────────────────────────────────────────────
test.describe('Page Terminaux', () => {
  test('affiche le titre et le formulaire de lancement', async ({ page }) => {
    await waitForPage(page, '/terminals', 'h2');
    await expect(page.locator('h2').first()).toContainText('Terminaux Claude Code');
    await expect(page.locator('input[placeholder*="Repertoire"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="Nom"]')).toBeVisible();
    await expect(page.locator('button:has-text("Lancer Claude Code")')).toBeVisible();
  });

  test('affiche le selecteur de modele', async ({ page }) => {
    await waitForPage(page, '/terminals', 'h2');
    const modelSelect = page.locator('select.form-input');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toContainText('Modele par defaut');
    await expect(modelSelect).toContainText('Sonnet');
    await expect(modelSelect).toContainText('Opus');
  });

  test('zone terminal vide par defaut', async ({ page }) => {
    await waitForPage(page, '/terminals', 'h2');
    await expect(page.locator('text=Selectionnez ou lancez un terminal')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────
// Page Conflits & Locks
// ─────────────────────────────────────────────────
test.describe('Page Conflits & Locks', () => {
  test('affiche le titre et les sections', async ({ page }) => {
    await waitForPage(page, '/conflicts', '.main-content h1');
    await expect(page.locator('.main-content h1')).toContainText('Conflits & Locks');
    await expect(page.locator('h2').filter({ hasText: 'Conflits actifs' })).toBeVisible();
    await expect(page.locator('h2').filter({ hasText: 'Fichiers verrouilles' })).toBeVisible();
  });

  test('bouton Analyser maintenant est present', async ({ page }) => {
    await waitForPage(page, '/conflicts', '.main-content h1');
    await expect(page.locator('button:has-text("Analyser maintenant")')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────
// Page Health Checks
// ─────────────────────────────────────────────────
test.describe('Page Health Checks', () => {
  test('affiche le titre et le bouton ajouter', async ({ page }) => {
    await waitForPage(page, '/health', '.main-content h1');
    await expect(page.locator('.main-content h1')).toContainText('Health Checks');
    await expect(page.locator('button:has-text("Ajouter un check")')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────
// Page Contexte Partage
// ─────────────────────────────────────────────────
test.describe('Page Contexte Partage', () => {
  test('affiche le titre et le bouton ajouter', async ({ page }) => {
    await waitForPage(page, '/context', '.main-content h1');
    await expect(page.locator('.main-content h1')).toContainText('Contexte Partage');
    await expect(page.locator('button:has-text("Ajouter")')).toBeVisible();
  });

  test('CRUD contexte via UI', async ({ page }) => {
    await waitForPage(page, '/context', '.main-content h1');
    // Ouvrir le formulaire (le bouton bascule showAdd)
    await page.locator('.btn-primary:has-text("Ajouter")').first().click();
    await page.waitForSelector('.ctx-form', { timeout: 3000 });
    const key = 'e2e-ctx-' + Date.now();
    await page.locator('input[placeholder*="convention"]').fill(key);
    await page.locator('textarea[placeholder*="camelCase"]').fill('valeur-test');
    // Le bouton "Ajouter" dans le formulaire (pas celui de la page-header)
    await page.locator('.ctx-form .btn-primary').click();
    // Verifier qu'il apparait
    await expect(page.locator(`.ctx-key:has-text("${key}")`)).toBeVisible({ timeout: 5000 });
    // Nettoyage via API
    await apiContext.delete(`/api/context/${encodeURIComponent(key)}`);
  });
});

// ─────────────────────────────────────────────────
// Page Messages
// ─────────────────────────────────────────────────
test.describe('Page Messages', () => {
  test('affiche le titre', async ({ page }) => {
    await waitForPage(page, '/messages', '.main-content h1');
    await expect(page.locator('.main-content h1')).toContainText('Messages');
  });
});

// ─────────────────────────────────────────────────
// Page Analytics
// ─────────────────────────────────────────────────
test.describe('Page Analytics', () => {
  test('affiche le titre', async ({ page }) => {
    await waitForPage(page, '/analytics', '.main-content h2');
    await expect(page.locator('.main-content h2').first()).toContainText('Analytics');
  });
});

// ─────────────────────────────────────────────────
// Notification Center
// ─────────────────────────────────────────────────
test.describe('Notification Center', () => {
  test('le bouton notification est visible dans la sidebar', async ({ page }) => {
    await waitForPage(page, '/', '.main-content');
    await expect(page.locator('.notif-trigger')).toBeVisible();
    await expect(page.locator('.notif-bell')).toBeVisible();
  });

  test('le panel s\'ouvre au clic', async ({ page }) => {
    await waitForPage(page, '/', '.main-content');
    await page.locator('.notif-trigger').click();
    await expect(page.locator('.notif-panel--open')).toBeVisible();
    await expect(page.locator('.notif-panel-header')).toBeVisible();
    await expect(page.locator('.notif-panel-header')).toContainText('Notifications');
  });

  test('le panel se ferme au clic sur le backdrop', async ({ page }) => {
    await waitForPage(page, '/', '.main-content');
    await page.locator('.notif-trigger').click();
    await expect(page.locator('.notif-panel--open')).toBeVisible();
    // Cliquer sur le backdrop pour fermer
    await page.locator('.notif-backdrop').click();
    await expect(page.locator('.notif-panel--open')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────
// Sidebar complete
// ─────────────────────────────────────────────────
test.describe('Sidebar - navigation complete', () => {
  const pages = [
    { path: '/agents', titlePart: 'Agent' },
    { path: '/conflicts', titlePart: 'Conflits' },
    { path: '/health', titlePart: 'Health' },
    { path: '/context', titlePart: 'Contexte' },
    { path: '/messages', titlePart: 'Messages' },
    { path: '/analytics', titlePart: 'Analytics', selector: 'h2' },
  ];

  for (const { path, titlePart, selector } of pages) {
    test(`navigue vers ${path}`, async ({ page }) => {
      await waitForPage(page, '/', '.main-content');
      await page.locator(`nav.sidebar a[href="${path}"]`).click();
      await expect(page).toHaveURL(path);
      const heading = selector === 'h2' ? '.main-content h2' : '.main-content h1';
      await expect(page.locator(heading).first()).toContainText(titlePart, { timeout: 5000 });
    });
  }
});

// ─────────────────────────────────────────────────
// API Backend - endpoints supplementaires
// ─────────────────────────────────────────────────
test.describe('API Backend - timeline', () => {
  test('GET /api/timeline retourne un tableau', async () => {
    const res = await apiContext.get('/api/timeline');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('GET /api/timeline/types retourne les types', async () => {
    const res = await apiContext.get('/api/timeline/types');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

test.describe('API Backend - locks et conflits', () => {
  test('GET /api/locks retourne un tableau', async () => {
    const res = await apiContext.get('/api/locks');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('GET /api/conflicts retourne un tableau', async () => {
    const res = await apiContext.get('/api/conflicts');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('POST /api/conflicts/analyze retourne un tableau', async () => {
    const res = await apiContext.post('/api/conflicts/analyze');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

test.describe('API Backend - contexte partage', () => {
  test('GET /api/context retourne un tableau', async () => {
    const res = await apiContext.get('/api/context');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('CRUD contexte complet', async () => {
    const key = 'e2e-api-ctx-' + Date.now();
    // Create
    const create = await apiContext.post('/api/context', {
      data: { key, value: 'test-value', author: 'e2e' },
    });
    expect(create.ok()).toBeTruthy();

    // Read
    const list = await apiContext.get('/api/context');
    const entries = await list.json();
    expect(entries.some((e) => e.key === key)).toBe(true);

    // Delete
    const del = await apiContext.delete(`/api/context/${encodeURIComponent(key)}`);
    expect(del.ok()).toBeTruthy();
  });
});

test.describe('API Backend - messages', () => {
  test('GET /api/messages retourne un tableau', async () => {
    const res = await apiContext.get('/api/messages');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('POST /api/messages envoie un message', async () => {
    const res = await apiContext.post('/api/messages', {
      data: { from: 'e2e', to: 'all', type: 'info', content: 'E2E test message' },
    });
    expect(res.ok()).toBeTruthy();
    const msg = await res.json();
    expect(msg).toHaveProperty('id');
    expect(msg.content).toBe('E2E test message');
  });
});

test.describe('API Backend - health checks', () => {
  test('GET /api/health-checks retourne un tableau', async () => {
    const res = await apiContext.get('/api/health-checks');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

test.describe('API Backend - notifications', () => {
  test('GET /api/notifications retourne un tableau', async () => {
    const res = await apiContext.get('/api/notifications');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('GET /api/notifications/count retourne le compteur', async () => {
    const res = await apiContext.get('/api/notifications/count');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('unread');
    expect(typeof data.unread).toBe('number');
  });
});

test.describe('API Backend - health global', () => {
  test('GET /api/health retourne le statut', async () => {
    const res = await apiContext.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  });
});

import { test, expect, request as playwrightRequest } from '@playwright/test';

// Utiliser 127.0.0.1 et non localhost (evite le delai IPv6 sur Windows)
let apiContext;
test.beforeAll(async () => {
  apiContext = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
  // Nettoyage des regles de test residuelles
  const res = await apiContext.get('/api/approval-rules');
  const rules = await res.json();
  for (const r of rules) {
    if (r.pattern.startsWith('e2e-') || r.pattern.startsWith('lecture-') || r.pattern.startsWith('test-playwright')) {
      await apiContext.delete(`/api/approval-rules/${r.id}`);
    }
  }
});
test.afterAll(async () => {
  await apiContext.dispose();
});

// Attend que React ait rendu le contenu principal
async function waitForApp(page) {
  await page.goto('/');
  await page.waitForSelector('.main-content', { timeout: 10000 });
  await page.waitForTimeout(800); // laisse React finir le render
}

test.describe('Dashboard - chargement', () => {
  test('affiche le titre Dashboard', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('.main-content h1').first()).toContainText('Dashboard');
  });

  test('affiche la section Sessions Actives', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('h2').filter({ hasText: 'Sessions Actives' })).toBeVisible();
  });

  test('affiche la barre de broadcast', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('.broadcast-bar')).toBeVisible();
    await expect(page.locator('.broadcast-label')).toBeVisible();
  });

  test('affiche le RecapPanel', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('.recap-panel').first()).toBeVisible();
  });

  test('les boutons de broadcast preset sont presents', async ({ page }) => {
    await waitForApp(page);
    for (const label of ['Pause tout', 'Reprendre tout', 'Annuler tout']) {
      await expect(page.locator(`.broadcast-btn:has-text("${label}")`)).toBeVisible();
    }
  });
});

test.describe('Dashboard - bouton + Terminal', () => {
  test('affiche le bouton + Terminal', async ({ page }) => {
    await waitForApp(page);
    await expect(page.locator('button.launch-btn')).toBeVisible();
  });

  test('le modal s\'ouvre au clic', async ({ page }) => {
    await waitForApp(page);
    await page.locator('button.launch-btn').click();
    await expect(page.locator('.modal-box')).toBeVisible();
    await expect(page.locator('.modal-header h2')).toContainText('Lancer un terminal');
  });

  test('le modal se ferme avec Annuler', async ({ page }) => {
    await waitForApp(page);
    await page.locator('button.launch-btn').click();
    await page.locator('button.modal-cancel').click();
    await expect(page.locator('.modal-box')).not.toBeVisible();
  });

  test('le modal se ferme en cliquant sur le backdrop', async ({ page }) => {
    await waitForApp(page);
    await page.locator('button.launch-btn').click();
    await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.modal-box')).not.toBeVisible();
  });

  test('lance un terminal et redirige vers /terminals', async ({ page }) => {
    await waitForApp(page);
    await page.locator('button.launch-btn').click();
    // Remplir le formulaire
    const inputs = page.locator('.modal-form input[type="text"]');
    await inputs.first().fill('C:/Perso/Workspace3');
    await inputs.nth(1).fill('E2E Terminal Test');
    await page.locator('button.modal-launch').click();
    await expect(page).toHaveURL(/\/terminals/, { timeout: 8000 });
  });
});

test.describe('Dashboard - broadcast', () => {
  test('le broadcast Pause tout affiche le feedback', async ({ page }) => {
    await waitForApp(page);
    await page.locator('.broadcast-btn:has-text("Pause tout")').click();
    await expect(page.locator('.broadcast-feedback')).toBeVisible({ timeout: 4000 });
  });

  test('le broadcast message custom fonctionne', async ({ page }) => {
    await waitForApp(page);
    await page.locator('.broadcast-input').fill('Test broadcast e2e');
    await page.locator('.broadcast-send').click();
    await expect(page.locator('.broadcast-feedback')).toBeVisible({ timeout: 4000 });
  });
});

test.describe('Navigation sidebar', () => {
  test('navigue vers Timeline', async ({ page }) => {
    await waitForApp(page);
    await page.locator('nav.sidebar a[href="/timeline"]').click();
    await expect(page).toHaveURL('/timeline');
    await expect(page.locator('.main-content h1').first()).toContainText('Timeline');
  });

  test('navigue vers Auto-Approbation', async ({ page }) => {
    await waitForApp(page);
    await page.locator('nav.sidebar a[href="/approval-rules"]').click();
    await expect(page).toHaveURL('/approval-rules');
    await expect(page.locator('.main-content h1').first()).toContainText('approbation');
  });

  test('navigue vers Terminaux', async ({ page }) => {
    await waitForApp(page);
    await page.locator('nav.sidebar a[href="/terminals"]').click();
    await expect(page).toHaveURL('/terminals');
  });
});

test.describe('API Backend - sessions', () => {
  test('GET /api/sessions retourne un tableau', async () => {
    const res = await apiContext.get('/api/sessions');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/sessions/recap retourne les stats', async () => {
    const res = await apiContext.get('/api/sessions/recap');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('totalSessions');
    expect(data).toHaveProperty('sessions');
    expect(Array.isArray(data.sessions)).toBe(true);
  });

  test('POST /api/sessions/broadcast-command fonctionne', async () => {
    const res = await apiContext.post('/api/sessions/broadcast-command', {
      data: { command: 'pause' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('sent');
    expect(typeof data.sent).toBe('number');
  });
});

test.describe('API Backend - terminaux', () => {
  test('GET /api/terminals/available retourne available', async () => {
    const res = await apiContext.get('/api/terminals/available');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('available');
  });

  test('POST /api/terminals lance un terminal', async () => {
    const res = await apiContext.post('/api/terminals', {
      data: { name: 'E2E Test Terminal', directory: 'C:/Perso/Workspace3' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('terminalId');
    if (data.terminalId) {
      await apiContext.delete(`/api/terminals/${data.terminalId}`);
    }
  });
});

test.describe('API Backend - approval rules', () => {
  test('GET /api/approval-rules retourne un tableau', async () => {
    const res = await apiContext.get('/api/approval-rules');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('CRUD complet', async () => {
    const create = await apiContext.post('/api/approval-rules', {
      data: { pattern: 'e2e-test-rule', action: 'approve', description: 'E2E test' },
    });
    expect(create.ok()).toBeTruthy();
    const rule = await create.json();
    expect(rule.id).toBeTruthy();

    const list = await apiContext.get('/api/approval-rules');
    const rules = await list.json();
    expect(rules.some((r) => r.id === rule.id)).toBe(true);

    const del = await apiContext.delete(`/api/approval-rules/${rule.id}`);
    expect(del.ok()).toBeTruthy();
  });

  test('POST /api/approval-rules/check fonctionne', async () => {
    // Créer une règle
    const create = await apiContext.post('/api/approval-rules', {
      data: { pattern: 'e2e-check', action: 'reject' },
    });
    expect(create.ok()).toBeTruthy();
    const rule = await create.json();

    const check = await apiContext.post('/api/approval-rules/check', {
      data: { text: 'action e2e-check fichier' },
    });
    expect(check.ok()).toBeTruthy();
    const result = await check.json();
    expect(result.action).toBe('reject');

    await apiContext.delete(`/api/approval-rules/${rule.id}`);
  });
});

test.describe('Page Approval Rules', () => {
  test('affiche le formulaire d\'ajout', async ({ page }) => {
    await page.goto('/approval-rules');
    await page.waitForSelector('input[placeholder*="Pattern"]', { timeout: 8000 });
    await expect(page.locator('input[placeholder*="Pattern"]')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
  });

  test('ajoute et supprime une règle', async ({ page }) => {
    await page.goto('/approval-rules');
    await page.waitForSelector('input[placeholder*="Pattern"]', { timeout: 8000 });
    const pattern = 'test-playwright-e2e-' + Date.now();
    await page.locator('input[placeholder*="Pattern"]').fill(pattern);
    await page.locator('button').filter({ hasText: 'Ajouter' }).first().click();
    await expect(page.locator('code').filter({ hasText: pattern })).toBeVisible({ timeout: 5000 });
    // Supprimer la règle ajoutée
    const deleteBtn = page.locator('.rule-delete').last();
    await deleteBtn.click();
    await expect(page.locator('code').filter({ hasText: pattern })).not.toBeVisible({ timeout: 5000 });
  });

  test('le testeur de règles fonctionne', async ({ page }) => {
    await page.goto('/approval-rules');
    await page.waitForSelector('input[placeholder*="Pattern"]', { timeout: 8000 });
    const pattern = 'lecture-e2e-' + Date.now();
    // Créer une règle
    await page.locator('input[placeholder*="Pattern"]').fill(pattern);
    await page.locator('select').selectOption('approve');
    await page.locator('button').filter({ hasText: 'Ajouter' }).first().click();
    await expect(page.locator('code').filter({ hasText: pattern })).toBeVisible({ timeout: 5000 });
    // Tester
    const testInput = page.locator('input[placeholder*="Texte à tester"]');
    await testInput.fill('action ' + pattern + ' fichier');
    await page.locator('button').filter({ hasText: 'Tester' }).click();
    await expect(page.locator('.test-result')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.test-result.approve')).toBeVisible();
    // Nettoyage
    await page.locator('.rule-delete').last().click();
  });
});

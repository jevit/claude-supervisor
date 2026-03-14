import { test, expect, request as playwrightRequest } from '@playwright/test';

// Contexte API direct sur le backend (127.0.0.1 pour eviter le delai IPv6 Windows)
let apiContext;
test.beforeAll(async () => {
  apiContext = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3001' });
});
test.afterAll(async () => {
  await apiContext.dispose();
});

// ─────────────────────────────────────────────────
// API Backend - Git diff
// ─────────────────────────────────────────────────
test.describe('API Backend - Git diff', () => {
  test('POST /api/git/diff retourne le diff d\'un repertoire git', async () => {
    const res = await apiContext.post('/api/git/diff', {
      data: { directory: 'C:/Perso/Workspace3/claude-supervisor' },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('files');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('combinedDiff');
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.summary).toHaveProperty('modified');
    expect(data.summary).toHaveProperty('added');
    expect(data.summary).toHaveProperty('deleted');
    expect(data.summary).toHaveProperty('untracked');
  });

  test('POST /api/git/diff sans directory retourne 400', async () => {
    const res = await apiContext.post('/api/git/diff', {
      data: {},
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  test('POST /api/git/diff sur un repertoire non-git retourne une erreur ou un resultat vide', async () => {
    // Certains systemes peuvent avoir un repo git parent englobant C:/Windows/Temp,
    // on verifie donc que la reponse est coherente (400 ou 200 avec files vide)
    const res = await apiContext.post('/api/git/diff', {
      data: { directory: 'C:/Windows/Temp' },
    });
    const data = await res.json();
    if (res.status() === 400) {
      expect(data.error).toBeTruthy();
    } else {
      expect(res.ok()).toBeTruthy();
      expect(data).toHaveProperty('files');
    }
  });

  test('GET /api/terminals/:id/diff retourne 404 pour un id inexistant', async () => {
    const res = await apiContext.get('/api/terminals/nonexistent-id/diff');
    expect(res.status()).toBe(404);
  });

  test('GET /api/terminals/:id/diff fonctionne pour un terminal existant', async () => {
    // Creer un terminal dans un repertoire git
    const create = await apiContext.post('/api/terminals', {
      data: { name: 'E2E Diff Test', directory: 'C:/Perso/Workspace3/claude-supervisor' },
    });
    expect(create.ok()).toBeTruthy();
    const { terminalId } = await create.json();
    expect(terminalId).toBeTruthy();

    try {
      const res = await apiContext.get(`/api/terminals/${terminalId}/diff`);
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data).toHaveProperty('files');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('combinedDiff');
    } finally {
      await apiContext.delete(`/api/terminals/${terminalId}`);
    }
  });
});

// ─────────────────────────────────────────────────
// API Backend - Terminal rename
// ─────────────────────────────────────────────────
test.describe('API Backend - Terminal rename', () => {
  test('PATCH /api/terminals/:id renomme un terminal', async () => {
    const create = await apiContext.post('/api/terminals', {
      data: { name: 'E2E Rename Before', directory: 'C:/Perso/Workspace3' },
    });
    expect(create.ok()).toBeTruthy();
    const { terminalId } = await create.json();

    try {
      const res = await apiContext.patch(`/api/terminals/${terminalId}`, {
        data: { name: 'E2E Rename After' },
      });
      expect(res.ok()).toBeTruthy();
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.name).toBe('E2E Rename After');

      // Verifier que le nom est bien mis a jour
      const info = await apiContext.get(`/api/terminals/${terminalId}`);
      const termData = await info.json();
      expect(termData.name).toBe('E2E Rename After');
    } finally {
      await apiContext.delete(`/api/terminals/${terminalId}`);
    }
  });

  test('PATCH /api/terminals/:id retourne 404 pour un id inexistant', async () => {
    const res = await apiContext.patch('/api/terminals/nonexistent-id', {
      data: { name: 'New Name' },
    });
    expect(res.status()).toBe(404);
  });

  test('PATCH /api/terminals/:id retourne 400 sans name', async () => {
    const create = await apiContext.post('/api/terminals', {
      data: { name: 'E2E NoName Test', directory: 'C:/Perso/Workspace3' },
    });
    const { terminalId } = await create.json();

    try {
      const res = await apiContext.patch(`/api/terminals/${terminalId}`, {
        data: {},
      });
      expect(res.status()).toBe(400);
    } finally {
      await apiContext.delete(`/api/terminals/${terminalId}`);
    }
  });
});

// ─────────────────────────────────────────────────
// API Backend - Terminal cleanup
// ─────────────────────────────────────────────────
test.describe('API Backend - Terminal cleanup', () => {
  test('POST /api/terminals/cleanup retourne le nombre de terminaux supprimes', async () => {
    const res = await apiContext.post('/api/terminals/cleanup');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('removed');
    expect(typeof data.removed).toBe('number');
  });
});

// ─────────────────────────────────────────────────
// API Backend - Squads
// ─────────────────────────────────────────────────
test.describe('API Backend - Squads', () => {
  test('GET /api/squads retourne un tableau', async () => {
    const res = await apiContext.get('/api/squads');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('POST /api/squads cree un squad', async () => {
    const res = await apiContext.post('/api/squads', {
      data: {
        name: 'E2E Squad Test',
        goal: 'Tester les squads en e2e',
        directory: 'C:/Perso/Workspace3/claude-supervisor',
        tasks: [
          { description: 'Tache 1', prompt: 'Faire quelque chose' },
          { description: 'Tache 2', prompt: 'Faire autre chose' },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const squad = await res.json();
    expect(squad).toHaveProperty('id');
    expect(squad.name).toBe('E2E Squad Test');
    expect(squad.goal).toBe('Tester les squads en e2e');

    // Nettoyage
    if (squad.id) {
      await apiContext.delete(`/api/squads/${squad.id}`);
      await apiContext.delete(`/api/squads/${squad.id}/remove`);
    }
  });

  test('GET /api/squads/:id retourne 404 pour un id inexistant', async () => {
    const res = await apiContext.get('/api/squads/nonexistent-id');
    expect(res.status()).toBe(404);
  });

  test('POST /api/squads sans champs requis retourne 400', async () => {
    const res = await apiContext.post('/api/squads', {
      data: { name: 'Incomplet' },
    });
    expect(res.status()).toBe(400);
  });

  test('CRUD squad complet', async () => {
    // Create
    const create = await apiContext.post('/api/squads', {
      data: {
        name: 'E2E CRUD Squad',
        goal: 'Test CRUD complet',
        directory: 'C:/Perso/Workspace3/claude-supervisor',
        tasks: [{ description: 'Tache unique', prompt: 'Prompt test' }],
      },
    });
    expect(create.status()).toBe(201);
    const squad = await create.json();

    // Read
    const get = await apiContext.get(`/api/squads/${squad.id}`);
    expect(get.ok()).toBeTruthy();
    const details = await get.json();
    expect(details.name).toBe('E2E CRUD Squad');

    // List includes it
    const list = await apiContext.get('/api/squads');
    const squads = await list.json();
    expect(squads.some((s) => s.id === squad.id)).toBe(true);

    // Cancel
    const cancel = await apiContext.delete(`/api/squads/${squad.id}`);
    expect(cancel.ok()).toBeTruthy();

    // Remove from history
    const remove = await apiContext.delete(`/api/squads/${squad.id}/remove`);
    expect(remove.ok()).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────
// API Backend - Git queue
// ─────────────────────────────────────────────────
test.describe('API Backend - Git queue', () => {
  test('GET /api/git/queue retourne un tableau', async () => {
    const res = await apiContext.get('/api/git/queue');
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('GET /api/git/branches retourne 400 sans directory', async () => {
    const res = await apiContext.get('/api/git/branches');
    expect(res.status()).toBe(400);
  });

  test('GET /api/git/branches retourne les branches', async () => {
    const res = await apiContext.get('/api/git/branches?directory=C:/Perso/Workspace3/claude-supervisor');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ─────────────────────────────────────────────────
// UI - Bouton diff sur la page Terminaux
// ─────────────────────────────────────────────────
test.describe('UI - Git diff panel', () => {
  test('le bouton diff est visible quand un terminal est selectionne', async ({ page }) => {
    // Lancer un terminal via API puis naviguer vers la page
    const create = await apiContext.post('/api/terminals', {
      data: { name: 'E2E Diff UI Test', directory: 'C:/Perso/Workspace3/claude-supervisor' },
    });
    const { terminalId } = await create.json();

    try {
      await page.goto('/terminals');
      await page.waitForSelector('h2', { timeout: 8000 });
      // Cliquer sur le terminal dans la liste (utilise la classe terminal-card)
      await page.locator(`.terminal-card:has-text("E2E Diff UI Test")`).click({ timeout: 5000 });
      // Le bouton diff (titre "Voir le diff Git") doit etre visible
      await expect(page.locator('button[title="Voir le diff Git"]')).toBeVisible({ timeout: 5000 });
    } finally {
      await apiContext.delete(`/api/terminals/${terminalId}`);
    }
  });
});

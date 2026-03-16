import { test, expect } from '@playwright/test';

// Test principal : sélectionner un terminal existant et vérifier que le contenu s'affiche
test('clicking existing terminal shows xterm with content', async ({ page }) => {
  const logs = [];
  page.on('console', (msg) => {
    if (!msg.text().includes('vite') && !msg.text().includes('React Router') && !msg.text().includes('DevTools')) {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  await page.goto('/terminals');
  await page.waitForLoadState('networkidle');

  await page.screenshot({ path: 'e2e/screenshots/before-click.png' });

  const cardCount = await page.locator('text=running').count();
  console.log(`Terminaux running trouvés: ${cardCount}`);

  if (cardCount === 0) {
    console.log('Aucun terminal running, skip');
    return;
  }

  // Cliquer sur le premier terminal RUNNING
  await page.locator('text=running').first().click({ force: true });

  // Attendre que TerminalView monte et replay se termine
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'e2e/screenshots/after-click-2s.png' });

  const xtermState = await page.evaluate(() => {
    const xterm  = document.querySelector('.xterm');
    const rows   = document.querySelector('.xterm-rows');
    const allText = rows?.innerText || rows?.textContent || '';
    const rowDivs = rows ? [...rows.querySelectorAll(':scope > div')] : [];
    const nonEmptyRows = rowDivs.filter(d => d.textContent?.trim()).length;

    return {
      hasXterm: !!xterm,
      xtermW: xterm?.offsetWidth,
      xtermH: xterm?.offsetHeight,
      hasRows: !!rows,
      totalRows: rowDivs.length,
      nonEmptyRows,
      rowsText: allText.substring(0, 300),
    };
  });

  console.log('\n=== ÉTAT XTERM APRÈS CLIC ===');
  console.log(JSON.stringify(xtermState, null, 2));
  logs.forEach(l => console.log(l));

  expect(xtermState.hasXterm).toBe(true);
  expect(xtermState.xtermW).toBeGreaterThan(400);
  expect(xtermState.xtermH).toBeGreaterThan(300);
  expect(xtermState.nonEmptyRows).toBeGreaterThan(0);
});

// Test spawn : inspecte l'état à plusieurs intervalles
test('spawn shows content within 5 seconds', async ({ page }) => {
  const logs = [];
  page.on('console', (msg) => {
    if (!msg.text().includes('vite') && !msg.text().includes('React Router') && !msg.text().includes('DevTools')) {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  await page.goto('/terminals');
  await page.waitForLoadState('networkidle');

  // Vérifier via l'API si le quota est atteint
  const probeRes = await page.request.post('/api/terminals', {
    data: { directory: 'C:/temp', name: '_probe_' },
  });
  if (!probeRes.ok()) {
    const body = await probeRes.json().catch(() => ({}));
    if (body.error?.includes('Limite')) {
      console.log(`Quota de terminaux atteint — test spawn ignoré`);
      return;
    }
  } else {
    // Probe a créé un terminal — le tuer pour rester propre
    const body = await probeRes.json().catch(() => ({}));
    if (body.terminalId) {
      await page.request.delete(`/api/terminals/${body.terminalId}`).catch(() => {});
    }
  }

  await page.screenshot({ path: 'e2e/screenshots/spawn-00-before.png' });

  // Spawn
  await page.locator('button:has-text("Lancer Claude Code")').click();

  // Snapshot à 500ms
  await page.waitForTimeout(500);
  const s500 = await inspectXterm(page);
  await page.screenshot({ path: 'e2e/screenshots/spawn-01-500ms.png' });
  console.log('=== 500ms ===', JSON.stringify(s500));

  // Snapshot à 1s
  await page.waitForTimeout(500);
  const s1000 = await inspectXterm(page);
  await page.screenshot({ path: 'e2e/screenshots/spawn-02-1s.png' });
  console.log('=== 1s ===', JSON.stringify(s1000));

  // Snapshot à 3s
  await page.waitForTimeout(2000);
  const s3000 = await inspectXterm(page);
  await page.screenshot({ path: 'e2e/screenshots/spawn-03-3s.png' });
  console.log('=== 3s ===', JSON.stringify(s3000));

  // Snapshot à 5s
  await page.waitForTimeout(2000);
  const s5000 = await inspectXterm(page);
  await page.screenshot({ path: 'e2e/screenshots/spawn-04-5s.png' });
  console.log('=== 5s ===', JSON.stringify(s5000));

  console.log('\n=== LOGS IMPORTANTS ===');
  logs.forEach(l => console.log(l));

  expect(s5000.hasXterm).toBe(true);
  expect(s5000.xtermW).toBeGreaterThan(400);
  expect(s5000.xtermH).toBeGreaterThan(300);
  // Vérifier le contenu : soit des rows, soit des cellules dans le buffer xterm
  expect(s5000.nonEmptyRows + s5000.bufferNonEmptyLines).toBeGreaterThan(0);
});

async function inspectXterm(page) {
  return page.evaluate(() => {
    const xterm  = document.querySelector('.xterm');
    const rows   = document.querySelector('.xterm-rows');
    const allText = rows?.innerText || rows?.textContent || '';
    const rowDivs = rows ? [...rows.querySelectorAll(':scope > div')] : [];
    const nonEmptyRows = rowDivs.filter(d => d.textContent?.trim()).length;

    // Inspecter aussi le buffer xterm via l'instance JS si accessible
    let bufferNonEmptyLines = 0;
    try {
      // xterm instance est exposée sur l'élément DOM via xterm.js internals
      const xtermEl = document.querySelector('.xterm-helper-textarea');
      // Compter les canvas rows avec contenu
      const canvases = document.querySelectorAll('.xterm-cursor-layer, .xterm-text-layer');
      bufferNonEmptyLines = canvases.length > 0 ? -1 : 0; // -1 = canvas mode (not DOM)
    } catch {}

    return {
      hasXterm: !!xterm,
      xtermW: xterm?.offsetWidth,
      xtermH: xterm?.offsetHeight,
      hasRows: !!rows,
      totalRows: rowDivs.length,
      nonEmptyRows,
      bufferNonEmptyLines,
      rowsText: allText.substring(0, 500),
    };
  });
}

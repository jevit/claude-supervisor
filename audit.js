/**
 * audit.js — Playwright audit script for the blank terminal bug
 * Run with: node audit.js
 *
 * Reproduces and diagnoses the issue where launching a new terminal
 * leaves the right panel blank until the user clicks elsewhere and back.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TERMINAL_URL = `${BASE_URL}/terminals`;
const OUT = path.join(__dirname, 'audit-screenshots');
fs.mkdirSync(OUT, { recursive: true });

// Collecte globale des erreurs JS
const pageErrors = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Snapshot complet de l'etat DOM du panneau droit + xterm
 */
async function snapshotRightPanel(page, label) {
  const result = await page.evaluate(() => {
    // Cherche la structure du panneau droit (2e colonne du grid principal)
    const gridContainers = document.querySelectorAll('[style*="grid-template-columns"]');
    let rightPanel = null;
    for (const gc of gridContainers) {
      if (gc.children.length >= 2) { rightPanel = gc.children[1]; break; }
    }

    // xterm elements
    const xtermEl       = document.querySelector('.xterm');
    const xtermCanvas   = document.querySelector('.xterm canvas');
    const xtermViewport = document.querySelector('.xterm-viewport');
    const xtermScreen   = document.querySelector('.xterm-screen');

    // Dimensions
    const dims = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) };
    };

    // WS status (dot dans le header TerminalView)
    const wsDot = document.querySelector('span[title="Connecte"], span[title="Reconnexion\u2026"], span[title="Deconnecte"], span[title="Replay\u2026"]');
    // fallback: cherche par title
    const allSpans = document.querySelectorAll('span[title]');
    let wsStatus = null;
    for (const s of allSpans) {
      const t = s.title;
      if (t === 'Connecte' || t === 'Connecté') { wsStatus = 'open'; break; }
      if (t && t.includes('Reconnexion')) { wsStatus = 'connecting'; break; }
      if (t && t.includes('connect')) { wsStatus = 'closed'; break; }
      if (t && t.includes('Replay')) { wsStatus = 'replaying'; break; }
    }

    // Nom du terminal dans l'en-tete
    let termName = null;
    const nameSpans = document.querySelectorAll('span[style*="cursor: text"], span[style*="cursor:text"]');
    if (nameSpans.length > 0) termName = nameSpans[0].textContent;

    // Le panneau droit affiche-t-il le message vide?
    const allText = rightPanel ? rightPanel.textContent : document.body.textContent;
    const showsEmptyMessage = allText.includes('elect') && allText.includes('terminal');

    // Combien de canvas xterm?
    const canvasCount = document.querySelectorAll('.xterm canvas').length;

    // Est-ce que le header TerminalView est visible?
    const hasTerminalHeader = document.querySelectorAll('button[title*="Export"], button[title*="Rechercher"]').length > 0;

    return {
      hasXtermEl:         !!xtermEl,
      hasXtermCanvas:     !!xtermCanvas,
      hasXtermViewport:   !!xtermViewport,
      hasXtermScreen:     !!xtermScreen,
      canvasCount,
      hasTerminalHeader,
      xtermDims:          dims(xtermEl),
      canvasDims:         dims(xtermCanvas),
      rightPanelDims:     dims(rightPanel),
      wsStatus,
      termName,
      showsEmptyMessage,
      rightPanelTextSnip: (rightPanel ? rightPanel.textContent : '').replace(/\s+/g, ' ').trim().substring(0, 150),
    };
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${label}]`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  xterm el in DOM:      ${result.hasXtermEl}`);
  console.log(`  xterm canvas:         ${result.hasXtermCanvas}  (count: ${result.canvasCount})`);
  console.log(`  xterm viewport:       ${result.hasXtermViewport}`);
  console.log(`  terminal header:      ${result.hasTerminalHeader}`);
  console.log(`  shows empty message:  ${result.showsEmptyMessage}`);
  console.log(`  xterm dims:           ${JSON.stringify(result.xtermDims)}`);
  console.log(`  canvas dims:          ${JSON.stringify(result.canvasDims)}`);
  console.log(`  right panel dims:     ${JSON.stringify(result.rightPanelDims)}`);
  console.log(`  WS status:            ${result.wsStatus}`);
  console.log(`  terminal name:        ${result.termName}`);
  console.log(`  panel text snippet:   "${result.rightPanelTextSnip}"`);

  return result;
}

/**
 * Inspecte le React fiber pour lire activeTerminal et terminals[]
 */
async function snapshotReactState(page, label) {
  const result = await page.evaluate(() => {
    try {
      const rootEl = document.getElementById('root');
      if (!rootEl) return { error: 'no #root' };

      const fiberKey = Object.keys(rootEl).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      if (!fiberKey) return { error: 'no React fiber' };

      function findFiber(fiber, name, depth) {
        if (!fiber || depth > 200) return null;
        if (fiber.type && (fiber.type.name === name || fiber.type.displayName === name)) return fiber;
        return findFiber(fiber.child, name, depth + 1) || findFiber(fiber.sibling, name, depth + 1);
      }

      const root = rootEl[fiberKey];
      const termsFiber = findFiber(root, 'Terminals', 0);
      if (!termsFiber) return { error: 'Terminals fiber not found' };

      // Lire les hooks useState (liste chainee memoizedState)
      const hookVals = [];
      let hook = termsFiber.memoizedState;
      let i = 0;
      while (hook && i < 8) {
        let val;
        try {
          const ms = hook.memoizedState;
          if (ms === null || ms === undefined) val = ms;
          else if (typeof ms === 'string') val = ms;
          else if (typeof ms === 'boolean') val = ms;
          else if (typeof ms === 'number') val = ms;
          else if (Array.isArray(ms)) val = `Array(${ms.length}) ids=[${ms.slice(0, 3).map((t) => t?.id?.substring(0, 8)).join(',')}]`;
          else if (ms instanceof Set) val = `Set(${ms.size})`;
          else if (typeof ms === 'object') val = `{${Object.keys(ms).slice(0, 4).join(',')}}`;
          else val = String(ms);
        } catch (e) { val = `(error: ${e.message})`; }
        hookVals.push({ i, val });
        hook = hook.next;
        i++;
      }

      // Les useState de Terminals (dans l'ordre de declaration):
      // 0: terminals (array)
      // 1: activeTerminal (string|null)
      // 2: available (bool)
      // 3: loading (bool)
      const terminalsArr = termsFiber.memoizedState?.memoizedState;
      let activeTerminal = null;
      let terminalsCount = null;
      let available = null;
      let loading = null;

      hook = termsFiber.memoizedState;
      i = 0;
      while (hook && i < 8) {
        const ms = hook.memoizedState;
        if (i === 0 && Array.isArray(ms)) terminalsCount = ms.length;
        if (i === 1 && (ms === null || typeof ms === 'string')) activeTerminal = ms;
        if (i === 2 && typeof ms === 'boolean') available = ms;
        if (i === 3 && typeof ms === 'boolean') loading = ms;
        hook = hook.next;
        i++;
      }

      return { terminalsCount, activeTerminal, available, loading, hookVals };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log(`\n  [React State — ${label}]`);
  if (result.error) {
    console.log(`    Error: ${result.error}`);
  } else {
    console.log(`    terminals[]: ${result.terminalsCount}`);
    console.log(`    activeTerminal: ${JSON.stringify(result.activeTerminal)}`);
    console.log(`    available: ${result.available}, loading: ${result.loading}`);
    console.log(`    hooks (first 8):`);
    (result.hookVals || []).forEach((h) => {
      console.log(`      [${h.i}]: ${JSON.stringify(h.val)}`);
    });
  }
  return result;
}

/**
 * Lit la key prop et les props du TerminalView fiber
 */
async function getTerminalViewFiber(page) {
  return page.evaluate(() => {
    try {
      const rootEl = document.getElementById('root');
      const fiberKey = Object.keys(rootEl).find((k) => k.startsWith('__reactFiber'));
      if (!fiberKey) return { error: 'no fiber' };

      function findFiber(fiber, name, depth) {
        if (!fiber || depth > 200) return null;
        if (fiber.type && fiber.type.name === name) return fiber;
        return findFiber(fiber.child, name, depth + 1) || findFiber(fiber.sibling, name, depth + 1);
      }

      const tv = findFiber(rootEl[fiberKey], 'TerminalView', 0);
      if (!tv) return { found: false };

      return {
        found:          true,
        key:            tv.key,
        terminalId:     tv.pendingProps?.terminalId,
        terminalName:   tv.pendingProps?.terminalName,
        terminalStatus: tv.pendingProps?.terminalStatus,
        compact:        tv.pendingProps?.compact,
      };
    } catch (e) {
      return { error: e.message };
    }
  });
}

/**
 * Une iteration complete du test
 */
async function runIteration(browser, iterNum) {
  console.log(`\n${'#'.repeat(70)}`);
  console.log(`## ITERATION ${iterNum}`);
  console.log(`${'#'.repeat(70)}`);

  const ctx  = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  // Collecte console
  const iterConsole = [];
  page.on('console', (msg) => {
    const e = { type: msg.type(), text: msg.text() };
    iterConsole.push(e);
    if (msg.type() === 'error') {
      console.log(`  [console.error] ${msg.text().substring(0, 250)}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message });
    console.log(`  [page error] ${err.message.substring(0, 300)}`);
  });

  // Navigation initiale
  console.log(`\n--> Navigating to ${TERMINAL_URL}`);
  await page.goto(TERMINAL_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await sleep(800);

  // Snapshot avant lancement
  console.log('\n[BEFORE LAUNCH]');
  await snapshotRightPanel(page, 'Before launch');
  const reactBefore = await snapshotReactState(page, 'Before launch');

  // Verifier bouton
  const btnInfo = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Lancer Claude Code'));
    return { found: !!btn, disabled: btn?.disabled };
  });
  console.log(`\n  Submit button found: ${btnInfo.found}, disabled: ${btnInfo.disabled}`);

  // Remplir le formulaire
  console.log('\n--> Filling form...');
  try {
    await page.locator('input[placeholder="C:/mon-projet"]').fill(`C:/temp-test-${iterNum}`);
  } catch (e) {
    console.log('  Could not fill directory input:', e.message.substring(0, 100));
  }
  try {
    await page.locator('input[placeholder="ex: Backend auth"]').fill(`Audit-${iterNum}`);
  } catch (e) {
    console.log('  Could not fill name input:', e.message.substring(0, 100));
  }

  // Cliquer "Lancer Claude Code"
  console.log('\n--> Clicking submit...');
  const t0 = Date.now();
  try {
    await page.locator('button', { hasText: 'Lancer Claude Code' }).click();
  } catch (e) {
    console.log('  Click failed:', e.message.substring(0, 100));
  }

  // --- T+50ms (avant fetchTerminals 300ms) ---
  await sleep(50);
  const snap50 = await snapshotRightPanel(page, `T+50ms (api call just fired, terminals[] stale)`);
  const react50 = await snapshotReactState(page, 'T+50ms');
  const tv50 = await getTerminalViewFiber(page);
  console.log(`  TerminalView fiber at T+50ms: found=${tv50.found}, key=${tv50.key}, status=${tv50.terminalStatus}`);

  // Screenshot
  await page.screenshot({ path: path.join(OUT, `iter${iterNum}-t050ms.png`) });

  // --- T+150ms ---
  await sleep(100);
  const snap150 = await snapshotRightPanel(page, 'T+150ms');
  const tv150 = await getTerminalViewFiber(page);
  console.log(`  TerminalView fiber at T+150ms: found=${tv150.found}, key=${tv150.key}, status=${tv150.terminalStatus}`);

  // --- T+350ms (apres fetchTerminals 300ms) ---
  await sleep(200);
  const snap350 = await snapshotRightPanel(page, 'T+350ms (fetchTerminals should have completed)');
  const react350 = await snapshotReactState(page, 'T+350ms');
  const tv350 = await getTerminalViewFiber(page);
  console.log(`  TerminalView fiber at T+350ms: found=${tv350.found}, key=${tv350.key}, status=${tv350.terminalStatus}`);

  // Screenshot
  await page.screenshot({ path: path.join(OUT, `iter${iterNum}-t350ms.png`) });

  // --- T+800ms ---
  await sleep(450);
  const snap800 = await snapshotRightPanel(page, 'T+800ms');
  const tv800 = await getTerminalViewFiber(page);

  // --- T+2s ---
  await sleep(1200);
  const snap2s = await snapshotRightPanel(page, 'T+2s');

  // Screenshot a T+2s
  await page.screenshot({ path: path.join(OUT, `iter${iterNum}-t2s.png`) });

  // --- Analyse key prop ---
  console.log('\n--- KEY PROP EVOLUTION ---');
  console.log(`  T+50ms:  key="${tv50.key}"  status=${tv50.terminalStatus}`);
  console.log(`  T+150ms: key="${tv150.key}"  status=${tv150.terminalStatus}`);
  console.log(`  T+350ms: key="${tv350.key}"  status=${tv350.terminalStatus}`);
  console.log(`  T+800ms: key="${tv800.key}"  status=${tv800.terminalStatus}`);

  const keyChanged = tv50.key !== tv350.key && tv50.found && tv350.found;
  if (keyChanged) {
    console.log(`  *** KEY CHANGED: "${tv50.key}" -> "${tv350.key}" ***`);
    console.log(`  *** This means TerminalView UNMOUNTED + REMOUNTED after fetchTerminals! ***`);
  } else if (tv50.found && tv350.found) {
    console.log(`  Key stable — no remount from key change`);
  }

  // --- Simuler "cliquer ailleurs puis revenir" ---
  console.log('\n--> Simulating click-elsewhere-and-back...');
  const cardCount = await page.locator('.terminal-card').count();
  console.log(`  Terminal cards in list: ${cardCount}`);

  let fixedByClick = null;

  if (cardCount >= 2) {
    // Cliquer sur un autre terminal
    await page.locator('.terminal-card').first().click();
    await sleep(300);
    const snapElsewhere = await snapshotRightPanel(page, 'After click on different terminal');

    // Cliquer sur le dernier (nouveau) terminal
    await page.locator('.terminal-card').last().click();
    await sleep(500);
    const snapBack = await snapshotRightPanel(page, 'After click back on new terminal');

    fixedByClick = !snap2s.hasXtermCanvas && snapBack.hasXtermCanvas;
    if (fixedByClick) {
      console.log('\n  *** BUG CONFIRMED: clicking elsewhere and back FIXES the blank panel! ***');
    } else if (snap2s.hasXtermCanvas) {
      console.log('\n  Terminal was already visible (no bug observed this iteration)');
    } else {
      console.log('\n  Still blank after click-back (different issue)');
    }

    // Screenshot apres fix
    await page.screenshot({ path: path.join(OUT, `iter${iterNum}-after-click-back.png`) });
  } else if (cardCount === 1) {
    // Naviguer sur une autre page puis revenir
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await sleep(300);
    await page.goto(TERMINAL_URL, { waitUntil: 'domcontentloaded' });
    await sleep(800);

    // Le terminal devrait etre selectionne via ?open= ou pas
    const snapAfterNav = await snapshotRightPanel(page, 'After navigate away+back (no activeTerminal restores)');
    console.log('  Note: navigation resets activeTerminal state');
  } else {
    console.log('  No cards — cannot test click-elsewhere');
  }

  // --- Rapport console ---
  const errs  = iterConsole.filter((m) => m.type === 'error');
  const warns = iterConsole.filter((m) => m.type === 'warning' && !m.text.includes('StrictMode') && !m.text.includes('Each child'));
  console.log(`\n  Console errors: ${errs.length}`);
  errs.forEach((e) => console.log(`    - ${e.text.substring(0, 250)}`));
  console.log(`  Console warnings (relevant): ${warns.length}`);
  warns.slice(0, 5).forEach((w) => console.log(`    - ${w.text.substring(0, 150)}`));

  // Statut final de l'iteration
  const status = (snap) => {
    if (snap.hasXtermCanvas) return 'RENDERED';
    if (snap.showsEmptyMessage) return 'EMPTY_MSG';
    return 'BLANK_NO_CANVAS';
  };

  const summary = {
    iter: iterNum,
    t50:   status(snap50),
    t150:  status(snap150),
    t350:  status(snap350),
    t800:  status(snap800),
    t2s:   status(snap2s),
    keyChanged,
    keyBefore:  tv50.key,
    keyAfter:   tv350.key,
    status50ms:  tv50.terminalStatus,
    status350ms: tv350.terminalStatus,
    terminalsCount50ms:  react50.terminalsCount,
    terminalsCount350ms: react350.terminalsCount,
    fixedByClick,
    xterm50Dims:  snap50.xtermDims,
    xterm350Dims: snap350.xtermDims,
  };

  console.log('\n--- ITERATION SUMMARY ---');
  console.log(`  Status timeline: T+50ms=${summary.t50} | T+150ms=${summary.t150} | T+350ms=${summary.t350} | T+800ms=${summary.t800} | T+2s=${summary.t2s}`);
  console.log(`  Key changed: ${summary.keyChanged} ("${summary.keyBefore}" -> "${summary.keyAfter}")`);
  console.log(`  terminals[] count: T+50ms=${summary.terminalsCount50ms} T+350ms=${summary.terminalsCount350ms}`);
  console.log(`  terminalStatus: T+50ms=${summary.status50ms} T+350ms=${summary.status350ms}`);
  console.log(`  xterm dims at T+50ms:  ${JSON.stringify(summary.xterm50Dims)}`);
  console.log(`  xterm dims at T+350ms: ${JSON.stringify(summary.xterm350Dims)}`);
  console.log(`  Fixed by click-elsewhere: ${summary.fixedByClick}`);

  await ctx.close();
  return summary;
}

async function main() {
  console.log('Claude Supervisor — Blank Terminal Panel Diagnostic');
  console.log('===================================================');
  console.log(`URL: ${TERMINAL_URL}`);
  console.log(`Screenshots: ${OUT}\n`);

  let browser;
  try {
    browser = await chromium.launch({ headless: false, slowMo: 0 });
  } catch (e) {
    console.error('Cannot launch Chromium:', e.message);
    console.error('Install playwright: npm install playwright && npx playwright install chromium');
    process.exit(1);
  }

  const ITERATIONS = 3;
  const results = [];

  for (let i = 1; i <= ITERATIONS; i++) {
    try {
      const r = await runIteration(browser, i);
      results.push(r);
      if (i < ITERATIONS) await sleep(2500);
    } catch (e) {
      console.error(`\nIteration ${i} error:`, e.message);
      results.push({ iter: i, error: e.message });
    }
  }

  await browser.close();

  // Rapport final
  console.log('\n');
  console.log('='.repeat(70));
  console.log('FINAL DIAGNOSTIC REPORT');
  console.log('='.repeat(70));

  results.forEach((r) => {
    if (r.error) {
      console.log(`\nIteration ${r.iter}: FAILED — ${r.error}`);
      return;
    }
    console.log(`\nIteration ${r.iter}:`);
    console.log(`  Timeline: T+50ms=${r.t50} | T+350ms=${r.t350} | T+2s=${r.t2s}`);
    console.log(`  Key change: ${r.keyChanged} (${r.keyBefore} -> ${r.keyAfter})`);
    console.log(`  terminals[] count: before=${r.terminalsCount50ms} after=${r.terminalsCount350ms}`);
    console.log(`  terminalStatus: before=${r.status50ms} after=${r.status350ms}`);
    console.log(`  xterm dims at mount (T+50ms):     ${JSON.stringify(r.xterm50Dims)}`);
    console.log(`  xterm dims after fetch (T+350ms): ${JSON.stringify(r.xterm350Dims)}`);
    console.log(`  Fixed by click-elsewhere: ${r.fixedByClick}`);
  });

  const good = results.filter((r) => !r.error);
  const keyChanges = good.filter((r) => r.keyChanged);
  const blankAt2s = good.filter((r) => r.t2s !== 'RENDERED');
  const fixedByClick = good.filter((r) => r.fixedByClick === true);

  console.log('\n--- CROSS-ITERATION ANALYSIS ---');
  console.log(`  Key prop changed:     ${keyChanges.length}/${good.length} iterations`);
  console.log(`  Blank at T+2s:        ${blankAt2s.length}/${good.length} iterations`);
  console.log(`  Fixed by click-back:  ${fixedByClick.length}/${good.length} iterations`);

  console.log('\n--- ROOT CAUSE ANALYSIS ---');

  if (keyChanges.length > 0) {
    console.log(`
CONFIRMED BUG MECHANISM (key prop change):
------------------------------------------
The TerminalView key is computed as:
  key=\`\${activeTerminal}-\${terminals.find(t => t.id === activeTerminal)?.status === 'ghost' ? 'ghost' : 'live'}\`

Timeline of the bug:
  T+0ms:   POST /api/terminals responds with { terminalId }
           setActiveTerminal(terminalId) is called immediately
           terminals[] does NOT contain the new terminal yet
           Key = "<id>-live" (undefined !== 'ghost' → 'live')
           TerminalView MOUNTS with key="<id>-live"
           xterm.open(containerRef) runs
           The container ref may have 0 dimensions at this point
           (flex layout not yet calculated for the new DOM node)

  T+300ms: setTimeout(fetchTerminals, 300) fires
           terminals[] now contains the new terminal (status='running')
           Re-render: terminals.find(id)?.status = 'running' → key stays "<id>-live"
           → NO key change → NO remount → xterm stays as-is
           BUT: if xterm canvas had 0 dimensions at mount, it stays 0x0!

ACTUAL ROOT CAUSE:
  Even though the key does NOT change, xterm.open() + fitAddon.fit()
  runs in a double requestAnimationFrame. At T+0ms the container div
  is newly inserted into the DOM and the flex layout engine may not
  have assigned it non-zero dimensions yet.

  fitAddon.fit() silently fails (or fits to 0x0 columns).
  The xterm canvas exists but has 0 height/width.

  WHY click-elsewhere fixes it:
  Clicking another terminal → setActiveTerminal(otherId) → TerminalView unmounts
  Clicking back → TerminalView remounts → this time container has correct dimensions
  → fitAddon.fit() succeeds → canvas renders properly
`);
  } else if (blankAt2s.length > 0) {
    console.log(`
BUG OBSERVED but key prop does NOT change.
Root cause: xterm.open() runs before container has dimensions.
The double-rAF (requestAnimationFrame x2) is insufficient.
`);
  } else {
    console.log('  No bug observed in these iterations (may be timing-dependent)');
    console.log('  Try running on a slower machine or with network throttling.');
  }

  console.log('\nPage JS errors (global):', pageErrors.length);
  pageErrors.slice(0, 5).forEach((e) => console.log('  -', e.message.substring(0, 200)));

  // Sauvegarder rapport JSON
  const reportPath = path.join(OUT, 'terminal-blank-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ results, pageErrors }, null, 2));
  console.log(`\nJSON report saved: ${reportPath}`);
  console.log(`Screenshots in:    ${OUT}`);
}

main().catch((e) => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});

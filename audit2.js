/**
 * audit2.js — Targeted diagnostic for the blank terminal panel bug.
 * xterm uses a DOM renderer (not canvas), so we check .xterm-rows.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'audit-screenshots');
fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function snapshot(page, label) {
  const r = await page.evaluate(() => {
    const xtermEl   = document.querySelector('.xterm');
    const xtermRows = document.querySelector('.xterm-rows');
    const viewport  = document.querySelector('.xterm-viewport');
    const hasDomRenderer = !!document.querySelector('[class*=xterm-dom-renderer-owner]');

    const dims = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    };

    // Sample first 3 rows to see if terminal content is present
    const rowSamples = xtermRows
      ? [...xtermRows.children].slice(0, 4).map((r) => r.textContent.replace(/\s+/g, ' ').trim().substring(0, 50))
      : [];

    // WS indicator dots (colored circles in TerminalView header)
    const wsDots = [...document.querySelectorAll('span[style*="border-radius: 50%"]')];
    const wsColors = wsDots.map((s) => s.style.background).filter(Boolean);

    // Header buttons (sign that TerminalView is mounted)
    const hasHeader = document.querySelectorAll('button[title*="Export"], button[title*="Rechercher"]').length > 0;

    // Terminal name
    const nameEl = document.querySelector('span[style*="cursor: text"]');

    // Right panel
    const grids = document.querySelectorAll('[style*="grid-template-columns"]');
    let rightPanel = null;
    for (const g of grids) {
      if (g.children.length >= 2) { rightPanel = g.children[1]; break; }
    }

    // Count xterm-dom-renderer-owner elements (each mount creates a new one)
    const domRendererOwners = [...document.querySelectorAll('[class*=xterm-dom-renderer-owner]')]
      .map((e) => [...e.classList].find((c) => c.includes('xterm-dom-renderer-owner')));

    return {
      hasXterm:        !!xtermEl,
      hasRows:         !!xtermRows,
      hasViewport:     !!viewport,
      hasDomRenderer,
      domRendererOwners,
      xtermDims:       dims(xtermEl),
      rowsDims:        dims(xtermRows),
      rowSamples,
      wsColors:        wsColors.slice(0, 3),
      hasHeader,
      termName:        nameEl?.textContent,
      showsEmpty:      document.body.textContent.includes('Selectionnez'),
      rightPanelSnip:  (rightPanel?.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 100),
    };
  });

  console.log('\n--- ' + label + ' ---');
  console.log('  xterm:', r.hasXterm, '| rows:', r.hasRows, '| domRenderer:', r.hasDomRenderer);
  console.log('  dims:', JSON.stringify(r.xtermDims), '| rows dims:', JSON.stringify(r.rowsDims));
  console.log('  domRendererOwners:', JSON.stringify(r.domRendererOwners));
  console.log('  showsEmpty:', r.showsEmpty, '| hasHeader:', r.hasHeader, '| termName:', r.termName);
  console.log('  WS colors:', JSON.stringify(r.wsColors));
  console.log('  row samples:', JSON.stringify(r.rowSamples));
  console.log('  right panel:', r.rightPanelSnip);
  return r;
}

async function readReactState(page) {
  return page.evaluate(() => {
    try {
      const root = document.getElementById('root');
      if (!root) return { error: 'no root' };

      const fk = Object.keys(root).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!fk) return { error: 'no fiber key', keys: Object.keys(root).filter((k) => k.startsWith('_')).slice(0, 5) };

      // Walk up to the actual root fiber
      let fiber = root[fk];
      // The stateNode fiber is the HostRoot - walk to find Terminals
      function findByName(f, name, depth) {
        if (!f || depth > 400) return null;
        const tname = f.type && (f.type.name || f.type.displayName);
        if (tname === name) return f;
        return findByName(f.child, name, depth + 1) || findByName(f.sibling, name, depth + 1);
      }

      const tf = findByName(fiber, 'Terminals', 0);
      if (!tf) {
        // Debug: what components did we find?
        const found = [];
        function collect(f, d) {
          if (!f || d > 30) return;
          const n = f.type && (f.type.name || f.type.displayName);
          if (n && !found.includes(n)) found.push(n);
          collect(f.child, d + 1);
          collect(f.sibling, d + 1);
        }
        collect(fiber, 0);
        return { error: 'Terminals not found', componentsSeen: found.slice(0, 20) };
      }

      // Read useState hooks
      const vals = [];
      let h = tf.memoizedState;
      let i = 0;
      while (h && i < 6) {
        const ms = h.memoizedState;
        let val;
        if (ms === null || ms === undefined) val = ms;
        else if (typeof ms === 'string') val = ms;
        else if (typeof ms === 'boolean') val = ms;
        else if (typeof ms === 'number') val = ms;
        else if (Array.isArray(ms)) {
          val = 'Array(' + ms.length + ')';
          if (ms[0] && ms[0].id) val += '[' + ms.slice(0, 2).map((t) => (t.id || '').substring(0, 8)).join(',') + ']';
        } else if (ms instanceof Set) val = 'Set(' + ms.size + ')';
        else val = typeof ms;
        vals.push({ i, val });
        h = h.next;
        i++;
      }

      // Also find TerminalView
      const tvf = findByName(tf, 'TerminalView', 0);
      const tvInfo = tvf ? {
        found: true,
        key: tvf.key,
        terminalId: tvf.pendingProps && tvf.pendingProps.terminalId,
        terminalName: tvf.pendingProps && tvf.pendingProps.terminalName,
        terminalStatus: tvf.pendingProps && tvf.pendingProps.terminalStatus,
      } : { found: false };

      return { hooks: vals, terminalView: tvInfo };
    } catch (e) {
      return { error: e.message + ' ' + e.stack && e.stack.substring(0, 200) };
    }
  });
}

async function main() {
  console.log('=== Blank Terminal Panel Diagnostic ===\n');

  const browser = await chromium.launch({ headless: false, slowMo: 0 });
  const allErrors = [];

  for (let iter = 1; iter <= 3; iter++) {
    console.log('\n' + '#'.repeat(60));
    console.log('## ITERATION ' + iter);
    console.log('#'.repeat(60));

    const ctx  = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();

    const iterErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') {
        iterErrors.push(m.text().substring(0, 200));
        console.log('  [error]', m.text().substring(0, 200));
      }
    });
    page.on('pageerror', (e) => {
      iterErrors.push('[pageerror] ' + e.message.substring(0, 200));
      console.log('  [pageerror]', e.message.substring(0, 200));
    });

    await page.goto('http://localhost:3000/terminals', { waitUntil: 'networkidle', timeout: 20000 });
    await sleep(1000);

    // ----- BEFORE STATE -----
    console.log('\n[BEFORE]');
    const before = await snapshot(page, 'Before launch');
    const reactBefore = await readReactState(page);
    console.log('  React state:', JSON.stringify(reactBefore));

    // ----- LAUNCH NEW TERMINAL -----
    console.log('\n[LAUNCHING NEW TERMINAL]');
    try {
      await page.locator('input[placeholder="C:/mon-projet"]').fill('C:/temp-' + iter);
      await page.locator('input[placeholder="ex: Backend auth"]').fill('Audit-' + iter);
    } catch (e) {
      console.log('  Form fill error:', e.message.substring(0, 100));
    }

    await page.locator('button', { hasText: 'Lancer Claude Code' }).click();
    console.log('  Clicked submit');

    // ----- T+30ms -----
    await sleep(30);
    const s30 = await snapshot(page, 'T+30ms');
    const r30 = await readReactState(page);
    console.log('  React at T+30ms:', JSON.stringify(r30));

    // ----- T+100ms -----
    await sleep(70);
    const s100 = await snapshot(page, 'T+100ms');

    // ----- T+350ms (after fetchTerminals 300ms) -----
    await sleep(250);
    const s350 = await snapshot(page, 'T+350ms');
    const r350 = await readReactState(page);
    console.log('  React at T+350ms:', JSON.stringify(r350));

    // ----- T+700ms -----
    await sleep(350);
    const s700 = await snapshot(page, 'T+700ms');

    // ----- T+1500ms -----
    await sleep(800);
    const s1500 = await snapshot(page, 'T+1500ms');

    await page.screenshot({ path: path.join(OUT, 'iter' + iter + '-t1500.png') });

    // ----- KEY ANALYSIS -----
    console.log('\n[KEY PROP ANALYSIS]');
    const tv30 = r30.terminalView || {};
    const tv350 = r350.terminalView || {};
    console.log('  TV key at T+30ms:', tv30.key, '| status:', tv30.terminalStatus);
    console.log('  TV key at T+350ms:', tv350.key, '| status:', tv350.terminalStatus);
    if (tv30.found && tv350.found && tv30.key !== tv350.key) {
      console.log('  *** KEY CHANGED — TerminalView remounted! ***');
    } else if (tv30.found && tv350.found) {
      console.log('  Key stable — no remount from key change');
    }

    // ----- terminals[] count -----
    const count30 = r30.hooks && r30.hooks[0] && r30.hooks[0].val;
    const count350 = r350.hooks && r350.hooks[0] && r350.hooks[0].val;
    const active30 = r30.hooks && r30.hooks[1] && r30.hooks[1].val;
    const active350 = r350.hooks && r350.hooks[1] && r350.hooks[1].val;
    console.log('  terminals[] count: T+30ms=' + count30 + ' T+350ms=' + count350);
    console.log('  activeTerminal: T+30ms=' + active30 + ' T+350ms=' + active350);

    // ----- CLICK ELSEWHERE TEST -----
    console.log('\n[CLICK ELSEWHERE TEST]');
    const cardCount = await page.locator('.terminal-card').count();
    console.log('  Cards in list:', cardCount);

    if (cardCount >= 2) {
      // Click first card (not our new terminal)
      await page.locator('.terminal-card').first().click();
      await sleep(400);
      const sElsewhere = await snapshot(page, 'After clicking elsewhere');

      // Click last card (our new terminal)
      await page.locator('.terminal-card').last().click();
      await sleep(600);
      const sBack = await snapshot(page, 'After clicking back on new terminal');

      await page.screenshot({ path: path.join(OUT, 'iter' + iter + '-after-click-back.png') });

      const wasBlank = !s1500.hasRows || s1500.rowSamples.every((r) => !r.trim());
      const isFixed = sBack.hasRows && sBack.hasDomRenderer;
      console.log('\n  BUG ANALYSIS:');
      console.log('    xterm rows at T+1500ms:', s1500.hasRows, '| dim:', JSON.stringify(s1500.rowsDims));
      console.log('    xterm rows after click-back:', sBack.hasRows, '| dim:', JSON.stringify(sBack.rowsDims));
      console.log('    Fixed by click-back:', !s1500.hasRows && sBack.hasRows);
    }

    // ----- SUMMARY -----
    const status = (s) => {
      if (!s.hasXterm) return 'NO_XTERM';
      if (!s.hasRows)  return 'XTERM_NO_ROWS';
      if (s.rowsDims && (s.rowsDims.w === 0 || s.rowsDims.h === 0)) return 'XTERM_ZERO_DIMS';
      return 'OK';
    };

    console.log('\n[ITERATION ' + iter + ' SUMMARY]');
    console.log('  T+30ms:   ' + status(s30));
    console.log('  T+100ms:  ' + status(s100));
    console.log('  T+350ms:  ' + status(s350));
    console.log('  T+700ms:  ' + status(s700));
    console.log('  T+1500ms: ' + status(s1500));
    console.log('  Console errors:', iterErrors.length);

    allErrors.push(...iterErrors);

    await ctx.close();
    await sleep(2000);
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log('Total console errors:', allErrors.length);
  allErrors.slice(0, 10).forEach((e) => console.log('  -', e.substring(0, 150)));
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  console.error(e.stack);
  process.exit(1);
});

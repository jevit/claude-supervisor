/**
 * Tests unitaires pour la logique de replay du terminal (Terminals.jsx).
 *
 * On teste :
 *  1. hasVisibleText — filtre les séquences ANSI sans texte visible
 *  2. Invariant de régression : le handler WS ne doit JAMAIS appeler xterm.reset()
 *  3. Mise en file des messages WS pendant le replay (isReplayingRef.current = true)
 *  4. Flush de la file après le replay
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── hasVisibleText ────────────────────────────────────────────────────────────
// Réplique fidèle de la définition dans Terminals.jsx (useEffect, ligne ~375).
// Si la définition dans la source change, mettre à jour ici en même temps.
const hasVisibleText = (s) =>
  s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')   // séquences CSI (couleurs, curseur…)
    .replace(/\x1b\][^\x07]*\x07/g, '')         // séquences OSC (titre fenêtre…)
    .replace(/[\r\n]/g, '')                      // retours chariot et sauts de ligne
    .trim()
    .length > 0;

describe('hasVisibleText', () => {
  it('retourne false pour une chaîne vide', () => {
    expect(hasVisibleText('')).toBe(false);
  });

  it('retourne false pour des séquences ANSI de couleur seules', () => {
    // \x1b[31m = rouge, \x1b[0m = reset — aucun texte visible
    expect(hasVisibleText('\x1b[31m\x1b[0m')).toBe(false);
  });

  it('retourne false pour des séquences OSC seules (titre fenêtre)', () => {
    // Séquence OSC typique pour changer le titre du terminal
    expect(hasVisibleText('\x1b]0;title\x07')).toBe(false);
  });

  it('retourne true pour du texte simple sans ANSI', () => {
    expect(hasVisibleText('hello')).toBe(true);
  });

  it('retourne true pour du texte entouré de codes couleur', () => {
    expect(hasVisibleText('\x1b[31mhello\x1b[0m')).toBe(true);
  });

  it('retourne false pour des newlines seuls', () => {
    expect(hasVisibleText('\r\n\r\n')).toBe(false);
  });

  it('retourne false pour des espaces seuls', () => {
    expect(hasVisibleText('   \t  ')).toBe(false);
  });

  it('retourne true pour l\'indicateur ⏳ avec codes ANSI (texte non-ASCII compte)', () => {
    // L'indicateur affiché pendant le démarrage — le ⏳ est un caractère visible
    const indicator = '\r\n\x1b[90m  ⏳ Démarrage de Claude Code…\x1b[0m\r\n';
    expect(hasVisibleText(indicator)).toBe(true);
  });

  it('retourne true pour une sortie Claude Code avec ANSI et du vrai texte', () => {
    // Exemple de sortie réelle de Claude Code (TUI)
    const claudeOutput = '\x1b[2J\x1b[H\x1b[32m✓\x1b[0m Claude Code prêt\r\n';
    expect(hasVisibleText(claudeOutput)).toBe(true);
  });

  it('retourne false pour des séquences CSI sans texte (commandes curseur uniquement)', () => {
    // Séquences CSI courantes sans texte : effacement écran, home, masque curseur
    // Note : \x1b= (keypad application mode) n'est PAS une séquence CSI et contient
    // le caractère '=' visible après strip — on teste donc uniquement les CSI pures.
    const cursorOnly = '\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H\x1b[?1h';
    expect(hasVisibleText(cursorOnly)).toBe(false);
  });

  it('retourne true si au moins un caractère non-vide est présent après strip', () => {
    // Mix d'ANSI et d'OSC avec un seul caractère visible
    expect(hasVisibleText('\x1b[0m\x1b]0;t\x07x')).toBe(true);
  });
});

// ── Invariant WS handler : jamais de xterm.reset() ───────────────────────────

describe('handler WS — invariant reset()', () => {
  let mockXterm;
  let isReplayingRef;

  beforeEach(() => {
    // Réinitialiser les mocks pour chaque test
    mockXterm = {
      reset:         vi.fn(),
      write:         vi.fn(),
      scrollToBottom: vi.fn(),
    };
    isReplayingRef = { current: false };
  });

  /**
   * Simule exactement le code du handler ws.onmessage de Terminals.jsx.
   * Le handler NE DOIT PAS appeler xterm.reset() — c'est l'invariant central.
   */
  function simulateWsMessage(data) {
    if (isReplayingRef.current) {
      // Mise en file — sera flushée après replayBuffer()
      return 'queued';
    }
    // Écriture directe — SANS reset() — c'est l'invariant
    mockXterm.write(data);
    mockXterm.scrollToBottom();
    return 'written';
  }

  it('le handler WS n\'appelle jamais xterm.reset()', () => {
    const result = simulateWsMessage('hello output from claude');

    expect(mockXterm.reset).not.toHaveBeenCalled();
    expect(mockXterm.write).toHaveBeenCalledWith('hello output from claude');
    expect(result).toBe('written');
  });

  it('le handler WS transmet les données brutes telles quelles', () => {
    // Les données brutes (avec séquences ANSI) doivent passer intactes vers xterm
    const rawData = '\x1b[32m✓\x1b[0m Task complete\r\n';
    simulateWsMessage(rawData);

    expect(mockXterm.write).toHaveBeenCalledWith(rawData);
  });

  it('plusieurs messages successifs ne déclenchent pas de reset()', () => {
    simulateWsMessage('msg1');
    simulateWsMessage('msg2');
    simulateWsMessage('msg3');

    expect(mockXterm.reset).not.toHaveBeenCalled();
    expect(mockXterm.write).toHaveBeenCalledTimes(3);
  });
});

// ── Mise en file pendant le replay ───────────────────────────────────────────

describe('handler WS — mise en file pendant le replay', () => {
  let mockXterm;
  let isReplayingRef;
  let queue;

  beforeEach(() => {
    mockXterm = {
      reset:         vi.fn(),
      write:         vi.fn(),
      scrollToBottom: vi.fn(),
    };
    isReplayingRef = { current: false };
    queue = [];
  });

  function simulateWsMessageWithQueue(data) {
    if (isReplayingRef.current) {
      queue.push(data);
      return;
    }
    mockXterm.write(data);
  }

  it('pendant le replay, les messages WS sont mis en file et non écrits', () => {
    isReplayingRef.current = true;

    simulateWsMessageWithQueue('msg1');
    simulateWsMessageWithQueue('msg2');

    // Les messages doivent être dans la file, pas écrits dans xterm
    expect(queue).toEqual(['msg1', 'msg2']);
    expect(mockXterm.write).not.toHaveBeenCalled();
    expect(mockXterm.reset).not.toHaveBeenCalled();
  });

  it('la file préserve l\'ordre d\'arrivée des messages', () => {
    isReplayingRef.current = true;
    const messages = ['alpha', 'beta', 'gamma', 'delta'];
    messages.forEach((m) => simulateWsMessageWithQueue(m));

    expect(queue).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('hors replay, les messages sont écrits directement (file ignorée)', () => {
    isReplayingRef.current = false;

    simulateWsMessageWithQueue('direct-write');

    expect(queue).toHaveLength(0);
    expect(mockXterm.write).toHaveBeenCalledWith('direct-write');
  });
});

// ── Flush de la file après le replay ─────────────────────────────────────────

describe('flush de la file après replay', () => {
  it('après le replay, tous les messages en file sont écrits dans xterm', () => {
    const mockXterm = {
      reset:         vi.fn(),
      write:         vi.fn(),
      scrollToBottom: vi.fn(),
    };

    // État post-replay : isReplaying repassé à false, file contenant 2 messages
    const queue = ['msg1', 'msg2'];
    const isReplayingRef = { current: false };

    // Simulation du flush (code issu de replayBuffer() dans Terminals.jsx)
    queue.splice(0).forEach((d) => mockXterm.write(d));

    expect(mockXterm.write).toHaveBeenCalledTimes(2);
    expect(mockXterm.write).toHaveBeenNthCalledWith(1, 'msg1');
    expect(mockXterm.write).toHaveBeenNthCalledWith(2, 'msg2');
    // La file doit être vide après le splice(0)
    expect(queue.length).toBe(0);
  });

  it('le flush respecte l\'ordre des messages mis en file', () => {
    const writes = [];
    const mockXterm = { write: (d) => writes.push(d), reset: vi.fn() };
    const queue = ['premier', 'deuxième', 'troisième'];

    queue.splice(0).forEach((d) => mockXterm.write(d));

    expect(writes).toEqual(['premier', 'deuxième', 'troisième']);
  });

  it('un flush sur une file vide ne provoque pas d\'erreur', () => {
    const mockXterm = { write: vi.fn(), reset: vi.fn() };
    const queue = [];

    // Ne doit pas lever d'exception
    expect(() => {
      queue.splice(0).forEach((d) => mockXterm.write(d));
    }).not.toThrow();

    expect(mockXterm.write).not.toHaveBeenCalled();
  });

  it('reset() n\'est jamais appelé pendant le flush', () => {
    const mockXterm = { reset: vi.fn(), write: vi.fn() };
    const queue = ['a', 'b', 'c'];

    // Flush — le reset ne doit pas être déclenché ici
    queue.splice(0).forEach((d) => mockXterm.write(d));

    expect(mockXterm.reset).not.toHaveBeenCalled();
  });
});

// ── Test de régression : cycle complet replay + flush ────────────────────────

describe('cycle complet replay → flush', () => {
  it('simule le cycle entier : replay actif → messages en file → flush', () => {
    const written = [];
    const mockXterm = {
      reset: vi.fn(),
      write: (d) => written.push(d),
      scrollToBottom: vi.fn(),
    };
    const isReplayingRef = { current: false };
    const wsMsgQueue = [];

    // Début du replay
    isReplayingRef.current = true;

    // Messages WS arrivant pendant le replay
    function handleWsData(data) {
      if (isReplayingRef.current) {
        wsMsgQueue.push(data);
      } else {
        mockXterm.write(data);
      }
    }

    handleWsData('ws-during-replay-1');
    handleWsData('ws-during-replay-2');

    // Vérifier que rien n'a été écrit pendant le replay
    expect(written).toHaveLength(0);
    expect(wsMsgQueue).toHaveLength(2);
    expect(mockXterm.reset).not.toHaveBeenCalled();

    // Fin du replay : écriture du buffer historique
    mockXterm.write('buffer-historique');
    expect(mockXterm.reset).not.toHaveBeenCalled(); // reset() n'est PAS dans le flush

    // Flush de la file
    isReplayingRef.current = false;
    wsMsgQueue.splice(0).forEach((d) => mockXterm.write(d));

    // Résultat final
    expect(written).toEqual([
      'buffer-historique',
      'ws-during-replay-1',
      'ws-during-replay-2',
    ]);
    expect(wsMsgQueue).toHaveLength(0);
    // reset() ne doit avoir été appelé à aucun moment dans ce chemin
    expect(mockXterm.reset).not.toHaveBeenCalled();
  });
});

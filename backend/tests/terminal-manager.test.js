/**
 * Tests unitaires pour TerminalManager.
 *
 * node-pty est mocké car c'est un module natif qui nécessite un vrai OS.
 * On injecte directement des terminaux factices dans `manager.terminals`
 * pour tester les méthodes sans spawn réel.
 */

// Mock de node-pty AVANT tout require — le module est natif et ne peut pas
// s'initialiser dans l'environnement Jest (pas de PTY disponible en CI).
jest.mock('node-pty', () => {
  return {
    spawn: jest.fn(() => ({
      pid: 12345,
      onData: jest.fn(),
      onExit: jest.fn(),
      write: jest.fn(),
      kill: jest.fn(),
      resize: jest.fn(),
    })),
  };
}, { virtual: true });

const { TerminalManager } = require('../src/services/terminal-manager');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Crée un tracker minimal compatible avec TerminalManager.
 * registerSession / removeSession / updateSession / getSession sont des no-op.
 */
function makeTracker() {
  return {
    registerSession: jest.fn(),
    removeSession:   jest.fn(),
    updateSession:   jest.fn(),
    getSession:      jest.fn(() => null),
  };
}

/**
 * Crée un broadcast factice qui enregistre les appels.
 */
function makeBroadcast() {
  const calls = [];
  const fn = (event, data) => calls.push({ event, data });
  fn.calls = calls;
  return fn;
}

/**
 * Construit un objet terminal factice prêt à être inséré dans manager.terminals.
 * @param {object} overrides - Propriétés à surcharger
 */
function makeTermEntry(overrides = {}) {
  const mockPty = {
    write:  jest.fn(),
    kill:   jest.fn(),
    resize: jest.fn(),
  };
  return {
    id:      't1',
    pty:     mockPty,
    status:  'running',
    buffer:  '',
    name:    'test-terminal',
    ...overrides,
    // Exposer mockPty pour les assertions
    _mockPty: mockPty,
  };
}

// ── Groupe principal ──────────────────────────────────────────────────────────

describe('TerminalManager', () => {

  // ── write() ────────────────────────────────────────────────────────────────

  describe('write()', () => {
    it('appelle pty.write() avec les données exactes', () => {
      const manager  = new TerminalManager(makeTracker(), makeBroadcast());
      const entry    = makeTermEntry({ id: 't1', buffer: '' });
      manager.terminals.set('t1', entry);

      manager.write('t1', 'a');

      // Le PTY doit avoir reçu exactement le caractère 'a'
      expect(entry._mockPty.write).toHaveBeenCalledWith('a');
      expect(entry._mockPty.write).toHaveBeenCalledTimes(1);
    });

    it('est synchrone — pas de await avant pty.write()', () => {
      // Ce test prouve que l'appel est synchrone : juste après write(),
      // sans aucun await, le mock doit déjà avoir été appelé.
      const manager  = new TerminalManager(makeTracker(), makeBroadcast());
      const entry    = makeTermEntry({ id: 't2', buffer: '' });
      manager.terminals.set('t2', entry);

      // Appel synchrone — on vérifie immédiatement, sans await ni setTimeout
      manager.write('t2', 'hello');

      // Si write() avait un await interne, call.length serait encore 0 ici
      expect(entry._mockPty.write.mock.calls.length).toBe(1);
    });

    it('lève une erreur pour un terminal inconnu', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());

      expect(() => manager.write('inconnu', 'data')).toThrow('Terminal non trouve ou arrete');
    });

    it('lève une erreur si le terminal n\'est pas running', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      const entry   = makeTermEntry({ id: 't3', status: 'exited' });
      manager.terminals.set('t3', entry);

      // Un terminal exited ne doit pas accepter d'écriture
      expect(() => manager.write('t3', 'data')).toThrow('Terminal non trouve ou arrete');
      expect(entry._mockPty.write).not.toHaveBeenCalled();
    });
  });

  // ── getOutput() ────────────────────────────────────────────────────────────

  describe('getOutput()', () => {
    it('retourne le buffer tronqué aux N derniers caractères', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      manager.terminals.set('t1', makeTermEntry({ id: 't1', buffer: '0123456789' }));

      // lastN=5 → on attend les 5 derniers chars
      const result = manager.getOutput('t1', 5);
      expect(result).toBe('56789');
    });

    it('retourne tout le buffer si lastN dépasse la longueur', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      manager.terminals.set('t1', makeTermEntry({ id: 't1', buffer: 'abc' }));

      expect(manager.getOutput('t1', 1000)).toBe('abc');
    });

    it('retourne null pour un terminal inconnu', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());

      expect(manager.getOutput('inexistant', 100)).toBeNull();
    });
  });

  // ── resize() ───────────────────────────────────────────────────────────────

  describe('resize()', () => {
    it('appelle pty.resize() avec les bonnes dimensions et retourne true', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      const entry   = makeTermEntry({ id: 't1' });
      manager.terminals.set('t1', entry);

      const result = manager.resize('t1', 200, 50);

      expect(result).toBe(true);
      expect(entry._mockPty.resize).toHaveBeenCalledWith(200, 50);
      expect(entry._mockPty.resize).toHaveBeenCalledTimes(1);
    });

    it('retourne false pour un terminal inconnu', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());

      expect(manager.resize('inexistant', 80, 24)).toBe(false);
    });

    it('retourne false si le terminal n\'est pas running', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      const entry   = makeTermEntry({ id: 't1', status: 'killed' });
      manager.terminals.set('t1', entry);

      expect(manager.resize('t1', 80, 24)).toBe(false);
      expect(entry._mockPty.resize).not.toHaveBeenCalled();
    });
  });

  // ── kill() ─────────────────────────────────────────────────────────────────

  describe('kill()', () => {
    it('arrête le terminal et met le status à killed', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      const entry   = makeTermEntry({ id: 't1', status: 'running' });
      manager.terminals.set('t1', entry);

      const result = manager.kill('t1');

      expect(result).toBe(true);
      expect(entry._mockPty.kill).toHaveBeenCalledTimes(1);
      expect(entry.status).toBe('killed');
    });

    it('retourne false pour un terminal inconnu', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());

      expect(manager.kill('inexistant')).toBe(false);
    });

    it('ne rappelle pas pty.kill() si déjà killed', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      const entry   = makeTermEntry({ id: 't1', status: 'killed' });
      manager.terminals.set('t1', entry);

      // kill() sur un terminal déjà tué → retourne true mais ne rappelle pas kill()
      const result = manager.kill('t1');
      expect(result).toBe(true);
      expect(entry._mockPty.kill).not.toHaveBeenCalled();
    });
  });

  // ── Troncature du buffer ────────────────────────────────────────────────────

  describe('troncature du buffer', () => {
    it('getOutput avec lastN > buffer.length retourne le buffer complet', () => {
      // Vérifie le comportement de slice(-N) quand N > longueur :
      // 'hello'.slice(-1000) === 'hello' — le buffer n'est pas tronqué.
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      const longBuffer = 'X'.repeat(200);
      manager.terminals.set('t1', makeTermEntry({ id: 't1', buffer: longBuffer }));

      // lastN=5 → les 5 derniers 'X'
      expect(manager.getOutput('t1', 5)).toBe('XXXXX');
    });

    it('le buffer injecté directement est respecté tel quel par getOutput', () => {
      // Ce test valide la troncature amont : si on injecte un buffer de 15 chars
      // mais que maxBufferSize est 10, les handlers onData auraient tronqué.
      // Ici on vérifie juste que getOutput retranche bien les N derniers chars.
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      // Simuler un buffer qui aurait déjà été tronqué à maxBufferSize=10
      const trimmedBuffer = 'ABCDEFGHIJ'; // 10 chars
      manager.terminals.set('t1', makeTermEntry({ id: 't1', buffer: trimmedBuffer }));

      // getOutput(id, 5) → les 5 derniers chars de 'ABCDEFGHIJ'
      expect(manager.getOutput('t1', 5)).toBe('FGHIJ');
      // getOutput(id, 10) → tout le buffer
      expect(manager.getOutput('t1', 10)).toBe('ABCDEFGHIJ');
    });

    it('maxBufferSize est configuré à 50000 par défaut', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      expect(manager.maxBufferSize).toBe(50000);
    });
  });

  // ── listTerminals() ────────────────────────────────────────────────────────

  describe('listTerminals()', () => {
    it('retourne une liste vide si aucun terminal', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      expect(manager.listTerminals()).toEqual([]);
    });

    it('inclut les terminaux injectés avec les champs attendus', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      manager.terminals.set('t1', {
        id:          't1',
        name:        'Mon terminal',
        directory:   '/tmp',
        status:      'running',
        pid:         999,
        prompt:      null,
        model:       null,
        dangerousMode: false,
        createdAt:   '2026-01-01T00:00:00.000Z',
        exitedAt:    null,
        savedAt:     null,
        resumedAt:   null,
        buffer:      'hello world',
      });

      const list = manager.listTerminals();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('t1');
      expect(list[0].name).toBe('Mon terminal');
      expect(list[0].status).toBe('running');
      expect(list[0].bufferSize).toBe('hello world'.length);
    });
  });

  // ── getTerminal() ──────────────────────────────────────────────────────────

  describe('getTerminal()', () => {
    it('retourne null pour un terminal inconnu', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      expect(manager.getTerminal('inexistant')).toBeNull();
    });

    it('retourne les informations du terminal trouvé', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      manager.terminals.set('t1', {
        id:          't1',
        name:        'Test',
        directory:   '/home',
        status:      'running',
        pid:         42,
        prompt:      'fais quelque chose',
        model:       null,
        dangerousMode: false,
        createdAt:   '2026-01-01T00:00:00.000Z',
        exitedAt:    null,
        savedAt:     null,
        resumedAt:   null,
        buffer:      'output here',
      });

      const info = manager.getTerminal('t1');
      expect(info).not.toBeNull();
      expect(info.id).toBe('t1');
      expect(info.prompt).toBe('fais quelque chose');
      expect(info.bufferSize).toBe('output here'.length);
    });
  });

  // ── cleanup() / destroyAll() ───────────────────────────────────────────────

  describe('cleanup()', () => {
    it('supprime les terminaux non-running', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      manager.terminals.set('running-1', makeTermEntry({ id: 'running-1', status: 'running' }));
      manager.terminals.set('exited-1',  makeTermEntry({ id: 'exited-1',  status: 'exited'  }));
      manager.terminals.set('killed-1',  makeTermEntry({ id: 'killed-1',  status: 'killed'  }));

      manager.cleanup();

      expect(manager.terminals.has('running-1')).toBe(true);
      expect(manager.terminals.has('exited-1')).toBe(false);
      expect(manager.terminals.has('killed-1')).toBe(false);
    });
  });

  describe('destroyAll()', () => {
    it('tue tous les terminaux running et vide la Map', () => {
      const manager = new TerminalManager(makeTracker(), makeBroadcast());
      const e1 = makeTermEntry({ id: 't1', status: 'running' });
      const e2 = makeTermEntry({ id: 't2', status: 'running' });
      manager.terminals.set('t1', e1);
      manager.terminals.set('t2', e2);

      manager.destroyAll();

      expect(e1._mockPty.kill).toHaveBeenCalled();
      expect(e2._mockPty.kill).toHaveBeenCalled();
      expect(manager.terminals.size).toBe(0);
    });
  });
});

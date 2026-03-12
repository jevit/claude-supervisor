const { ConflictDetector } = require('../src/services/conflict-detector');

function makeBroadcast() {
  const calls = [];
  const fn = (event, data) => calls.push({ event, data });
  fn.calls = calls;
  return fn;
}

function makeTracker(sessions = []) {
  return { getAllSessions: () => sessions };
}

function makeLockManager(conflicts = []) {
  return { getConflicts: () => conflicts };
}

describe('ConflictDetector', () => {
  test('detecte les conflits de fichier depuis les locks', () => {
    const broadcast = makeBroadcast();
    const tracker = makeTracker();
    const lockMgr = makeLockManager([
      { filePath: '/src/index.js', holders: ['s1', 's2'] },
    ]);

    const detector = new ConflictDetector(tracker, lockMgr, broadcast);
    const conflicts = detector.analyze();

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].type).toBe('file');
    expect(conflicts[0].severity).toBe('error');
    expect(broadcast.calls[0].event).toBe('conflict:detected');
  });

  test('detecte les conflits de repertoire', () => {
    const broadcast = makeBroadcast();
    const tracker = makeTracker([
      { id: 's1', status: 'active', directory: '/project/src' },
      { id: 's2', status: 'active', directory: '/project/src' },
    ]);
    const lockMgr = makeLockManager();

    const detector = new ConflictDetector(tracker, lockMgr, broadcast);
    const conflicts = detector.analyze();

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].type).toBe('directory');
    expect(conflicts[0].sessions).toEqual(['s1', 's2']);
  });

  test('detecte les doublons de travail', () => {
    const broadcast = makeBroadcast();
    const tracker = makeTracker([
      { id: 's1', status: 'active', directory: '/a', currentTask: 'Refactoring authentication module' },
      { id: 's2', status: 'active', directory: '/b', currentTask: 'Refactoring authentication service module' },
    ]);
    const lockMgr = makeLockManager();

    const detector = new ConflictDetector(tracker, lockMgr, broadcast);
    const conflicts = detector.analyze();

    const duplicates = conflicts.filter((c) => c.type === 'duplicate_task');
    expect(duplicates.length).toBe(1);
    expect(duplicates[0].details.similarity).toBeGreaterThan(50);
  });

  test('detecte la resolution de conflits', () => {
    const broadcast = makeBroadcast();
    const tracker = makeTracker([
      { id: 's1', status: 'active', directory: '/same' },
      { id: 's2', status: 'active', directory: '/same' },
    ]);
    const lockMgr = makeLockManager();

    const detector = new ConflictDetector(tracker, lockMgr, broadcast);
    detector.analyze(); // Cree le conflit

    // Resoudre: une session part
    const tracker2 = makeTracker([
      { id: 's1', status: 'active', directory: '/same' },
    ]);
    detector.tracker = tracker2;
    detector.analyze();

    const resolved = broadcast.calls.filter((c) => c.event === 'conflict:resolved');
    expect(resolved.length).toBe(1);
  });

  test('_taskSimilarity retourne 0 pour taches vides', () => {
    const detector = new ConflictDetector(makeTracker(), makeLockManager(), () => {});
    expect(detector._taskSimilarity('', 'test')).toBe(0);
    expect(detector._taskSimilarity('ab', 'cd')).toBe(0);
  });

  test('getConflicts retourne les conflits actifs', () => {
    const detector = new ConflictDetector(
      makeTracker([
        { id: 's1', status: 'active', directory: '/same' },
        { id: 's2', status: 'active', directory: '/same' },
      ]),
      makeLockManager(),
      () => {}
    );
    detector.analyze();
    expect(detector.getConflicts().length).toBe(1);
  });
});

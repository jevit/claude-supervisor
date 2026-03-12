const { TerminalTracker } = require('../src/services/terminal-tracker');

function makeBroadcast() {
  const calls = [];
  const fn = (event, data) => calls.push({ event, data });
  fn.calls = calls;
  return fn;
}

describe('TerminalTracker', () => {
  test('registerSession cree une session', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);

    const session = tracker.registerSession('s1', { name: 'Test' });
    expect(session.id).toBe('s1');
    expect(session.name).toBe('Test');
    expect(session.status).toBe('active');
    expect(broadcast.calls.length).toBe(1);
    expect(broadcast.calls[0].event).toBe('session:registered');
  });

  test('updateSession met a jour la tache', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);
    tracker.registerSession('s1', { name: 'Test' });

    const updated = tracker.updateSession('s1', { currentTask: 'Fix bug' });
    expect(updated.currentTask).toBe('Fix bug');
  });

  test('updateSession avec action enrichit l\'historique', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);
    tracker.registerSession('s1', { name: 'Test' });

    tracker.updateSession('s1', { action: 'Edited file.js' });
    const sessions = tracker.getAllSessions();
    expect(sessions[0].history.length).toBe(1);
    expect(sessions[0].history[0].action).toBe('Edited file.js');
  });

  test('removeSession supprime la session', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);
    tracker.registerSession('s1', { name: 'Test' });
    tracker.removeSession('s1');
    expect(tracker.getAllSessions().length).toBe(0);
  });

  test('cleanupStale marque les sessions inactives', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);
    const session = tracker.registerSession('s1', { name: 'Test' });
    // Forcer lastUpdate dans le passe
    session.lastUpdate = new Date(Date.now() - 200000).toISOString();

    tracker.cleanupStale(120000);
    expect(tracker.getAllSessions()[0].status).toBe('stale');
  });

  test('getRecap retourne un recap consolide', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);
    tracker.registerSession('s1', { name: 'Active' });
    tracker.registerSession('s2', { name: 'Idle', status: 'idle' });

    const recap = tracker.getRecap();
    expect(recap.totalSessions).toBe(2);
    expect(recap.active).toBe(1);
    expect(recap.idle).toBe(1);
    expect(recap.sessions.length).toBe(2);
  });

  test('cleanupStale purge les sessions stale apres purgeAge', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);
    const session = tracker.registerSession('s1', { name: 'Test' });
    // Forcer en stale depuis longtemps
    session.status = 'stale';
    session.lastUpdate = new Date(Date.now() - 700000).toISOString(); // 11+ min

    tracker.cleanupStale(120000, 600000);
    expect(tracker.getAllSessions().length).toBe(0);
    expect(broadcast.calls.some((c) => c.event === 'session:purged')).toBe(true);
  });

  test('updateSession retourne null pour session inexistante', () => {
    const broadcast = makeBroadcast();
    const tracker = new TerminalTracker(broadcast);
    expect(tracker.updateSession('nope', {})).toBeNull();
  });
});

const { NotificationManager } = require('../src/services/notification-manager');

describe('NotificationManager', () => {
  test('processEvent genere une notification pour les evenements connus', () => {
    const mgr = new NotificationManager();
    const notif = mgr.processEvent('health:fail', { name: 'build' });
    expect(notif).not.toBeNull();
    expect(notif.severity).toBe('error');
    expect(notif.title).toContain('build');
  });

  test('processEvent retourne null pour les evenements inconnus', () => {
    const mgr = new NotificationManager();
    expect(mgr.processEvent('unknown:event', {})).toBeNull();
  });

  test('getNotifications retourne les notifications recentes en premier', () => {
    const mgr = new NotificationManager();
    mgr.processEvent('session:registered', { name: 'First' });
    mgr.processEvent('session:registered', { name: 'Second' });

    const notifs = mgr.getNotifications();
    expect(notifs[0].title).toContain('Second');
    expect(notifs[1].title).toContain('First');
  });

  test('markRead marque une notification', () => {
    const mgr = new NotificationManager();
    const notif = mgr.processEvent('session:registered', { name: 'Test' });
    mgr.markRead(notif.id);
    expect(mgr.getUnreadCount()).toBe(0);
  });

  test('markAllRead marque tout', () => {
    const mgr = new NotificationManager();
    mgr.processEvent('session:registered', { name: 'A' });
    mgr.processEvent('session:registered', { name: 'B' });
    mgr.markAllRead();
    expect(mgr.getUnreadCount()).toBe(0);
  });

  test('respecte maxNotifications', () => {
    const mgr = new NotificationManager(null, { maxNotifications: 3 });
    for (let i = 0; i < 5; i++) {
      mgr.processEvent('session:registered', { name: `S${i}` });
    }
    expect(mgr.getNotifications({ limit: 100 }).length).toBe(3);
  });

  test('unreadOnly filtre les notifications lues', () => {
    const mgr = new NotificationManager();
    const n1 = mgr.processEvent('session:registered', { name: 'A' });
    mgr.processEvent('session:registered', { name: 'B' });
    mgr.markRead(n1.id);

    const unread = mgr.getNotifications({ unreadOnly: true });
    expect(unread.length).toBe(1);
    expect(unread[0].title).toContain('B');
  });

  test('processEvent avec regles personnalisees', () => {
    const mgr = new NotificationManager();
    // Ajouter une regle custom
    mgr.addRule('custom:event', {
      severity: 'warning',
      title: (data) => `Custom: ${data.msg}`,
      message: (data) => data.msg,
    });

    const notif = mgr.processEvent('custom:event', { msg: 'hello' });
    expect(notif).not.toBeNull();
    expect(notif.severity).toBe('warning');
    expect(notif.title).toBe('Custom: hello');
  });

  test('removeRule supprime une regle', () => {
    const mgr = new NotificationManager();
    mgr.addRule('temp:event', {
      severity: 'info',
      title: () => 'Temp',
      message: () => 'temp',
    });
    mgr.removeRule('temp:event');
    expect(mgr.processEvent('temp:event', {})).toBeNull();
  });

  test('getRules retourne toutes les regles', () => {
    const mgr = new NotificationManager();
    const rules = mgr.getRules();
    expect(Object.keys(rules).length).toBeGreaterThanOrEqual(5); // 5 regles par defaut
  });
});

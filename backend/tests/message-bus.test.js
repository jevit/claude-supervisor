const { MessageBus } = require('../src/services/message-bus');

function makeBroadcast() {
  const calls = [];
  const fn = (event, data) => calls.push({ event, data });
  fn.calls = calls;
  return fn;
}

describe('MessageBus', () => {
  test('send cree un message avec id unique', () => {
    const broadcast = makeBroadcast();
    const bus = new MessageBus(broadcast);

    const msg = bus.send('s1', 's2', { type: 'info', content: 'Hello' });
    expect(msg.id).toBeDefined();
    expect(msg.from).toBe('s1');
    expect(msg.to).toBe('s2');
    expect(msg.content).toBe('Hello');
    expect(msg.read).toBe(false);
  });

  test('send broadcast un evenement message:received', () => {
    const broadcast = makeBroadcast();
    const bus = new MessageBus(broadcast);
    bus.send('s1', 's2', { content: 'Hi' });
    expect(broadcast.calls[0].event).toBe('message:received');
  });

  test('getMessages filtre par destinataire', () => {
    const broadcast = makeBroadcast();
    const bus = new MessageBus(broadcast);
    bus.send('s1', 's2', { content: 'For s2' });
    bus.send('s1', 's3', { content: 'For s3' });
    bus.send('s1', 'all', { content: 'Broadcast' });

    const msgs = bus.getMessages('s2');
    expect(msgs.length).toBe(2); // direct + broadcast
    expect(msgs.some((m) => m.content === 'For s2')).toBe(true);
    expect(msgs.some((m) => m.content === 'Broadcast')).toBe(true);
  });

  test('markRead marque un message comme lu', () => {
    const broadcast = makeBroadcast();
    const bus = new MessageBus(broadcast);
    const msg = bus.send('s1', 's2', { content: 'Hi' });
    expect(bus.markRead(msg.id)).toBe(true);

    const msgs = bus.getMessages('s2', { unreadOnly: true });
    expect(msgs.length).toBe(0);
  });

  test('getUnreadCount retourne le bon compteur', () => {
    const broadcast = makeBroadcast();
    const bus = new MessageBus(broadcast);
    bus.send('s1', 's2', { content: 'A' });
    bus.send('s1', 's2', { content: 'B' });
    expect(bus.getUnreadCount('s2')).toBe(2);
  });

  test('respecte maxMessages', () => {
    const broadcast = makeBroadcast();
    const bus = new MessageBus(broadcast, null, { maxMessages: 3 });
    bus.send('s1', 's2', { content: '1' });
    bus.send('s1', 's2', { content: '2' });
    bus.send('s1', 's2', { content: '3' });
    bus.send('s1', 's2', { content: '4' });
    expect(bus.getAllMessages().length).toBe(3);
  });
});

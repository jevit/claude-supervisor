const fs = require('fs');
const path = require('path');
const { JsonStore } = require('../src/services/json-store');

const TEST_FILE = path.join(__dirname, 'test-data', 'test-store.json');

function cleanup() {
  try { fs.unlinkSync(TEST_FILE); } catch {}
  try { fs.unlinkSync(TEST_FILE + '.tmp'); } catch {}
  try { fs.rmdirSync(path.dirname(TEST_FILE)); } catch {}
}

describe('JsonStore', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  test('load retourne {} si fichier inexistant', () => {
    const store = new JsonStore(TEST_FILE);
    const data = store.load();
    expect(data).toEqual({});
  });

  test('set + get fonctionnent', () => {
    const store = new JsonStore(TEST_FILE, { debounceMs: 50 });
    store.load();
    store.set('foo', { bar: 42 });
    expect(store.get('foo')).toEqual({ bar: 42 });
    store.destroy(); // Annuler le timer debounce
  });

  test('saveSync persiste sur disque', () => {
    const store = new JsonStore(TEST_FILE, { debounceMs: 50 });
    store.load();
    store.set('key', 'value');
    store.saveSync();

    const store2 = new JsonStore(TEST_FILE);
    store2.load();
    expect(store2.get('key')).toBe('value');
  });

  test('destroy sauvegarde les donnees', () => {
    const store = new JsonStore(TEST_FILE, { debounceMs: 50 });
    store.load();
    store.set('saved', true);
    store.destroy();

    const store2 = new JsonStore(TEST_FILE);
    store2.load();
    expect(store2.get('saved')).toBe(true);
  });

  test('load gere les fichiers JSON corrompus', () => {
    fs.mkdirSync(path.dirname(TEST_FILE), { recursive: true });
    fs.writeFileSync(TEST_FILE, 'not json!', 'utf-8');

    const store = new JsonStore(TEST_FILE);
    const data = store.load();
    expect(data).toEqual({});
  });
});

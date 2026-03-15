import { describe, it, expect } from 'vitest';
import {
  parseDiff,
  buildSideBySide,
  buildFileTree,
  fileColor,
  fileStatusLetter,
} from '../../components/GitDiffPanel';

// ── parseDiff ─────────────────────────────────────────────────────────────────

describe('parseDiff', () => {
  it('retourne [] pour un input null/undefined/vide', () => {
    expect(parseDiff(null)).toEqual([]);
    expect(parseDiff(undefined)).toEqual([]);
    expect(parseDiff('')).toEqual([]);
  });

  it('retourne [] si aucun hunk (pas de ligne @@)', () => {
    expect(parseDiff('diff --git a/foo b/foo\nindex abc..def')).toEqual([]);
  });

  it('parse un hunk simple avec ajouts', () => {
    const raw = `@@ -1,3 +1,4 @@
 context
+ajout
 context2`;
    const hunks = parseDiff(raw);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toContain('@@ -1,3 +1,4 @@');
    const addLine = hunks[0].lines.find((l) => l.type === 'add');
    expect(addLine).toBeDefined();
    expect(addLine.content).toBe('ajout');
    expect(addLine.oldNum).toBeNull();
    expect(addLine.newNum).toBe(2);
  });

  it('parse un hunk simple avec suppressions', () => {
    const raw = `@@ -1,3 +1,2 @@
 context
-supprimé
 context2`;
    const hunks = parseDiff(raw);
    const delLine = hunks[0].lines.find((l) => l.type === 'del');
    expect(delLine.content).toBe('supprimé');
    expect(delLine.oldNum).toBe(2);
    expect(delLine.newNum).toBeNull();
  });

  it('numérote correctement les lignes de contexte', () => {
    const raw = `@@ -10,3 +10,3 @@
 ctx1
 ctx2
 ctx3`;
    const hunks = parseDiff(raw);
    const [l1, l2, l3] = hunks[0].lines;
    expect(l1.oldNum).toBe(10);
    expect(l1.newNum).toBe(10);
    expect(l2.oldNum).toBe(11);
    expect(l3.oldNum).toBe(12);
  });

  it('ignore les lignes commençant par \\ (no-newline at end of file)', () => {
    const raw = `@@ -1,1 +1,1 @@
-ancien
\\ No newline at end of file
+nouveau
\\ No newline at end of file`;
    const hunks = parseDiff(raw);
    const types = hunks[0].lines.map((l) => l.type);
    expect(types).not.toContain('\\');
    expect(types).toContain('del');
    expect(types).toContain('add');
  });

  it('parse plusieurs hunks', () => {
    const raw = `@@ -1,2 +1,2 @@
 ctx
+ajout1
@@ -10,2 +10,2 @@
 ctx2
+ajout2`;
    const hunks = parseDiff(raw);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].lines.find((l) => l.content === 'ajout1')).toBeDefined();
    expect(hunks[1].lines.find((l) => l.content === 'ajout2')).toBeDefined();
  });

  it('incrémente correctement les numéros de ligne old/new séparément', () => {
    const raw = `@@ -1,4 +1,4 @@
 ctx
-del1
-del2
+add1
+add2
 ctx2`;
    const hunks = parseDiff(raw);
    const lines = hunks[0].lines;
    const dels = lines.filter((l) => l.type === 'del');
    const adds = lines.filter((l) => l.type === 'add');
    expect(dels[0].oldNum).toBe(2);
    expect(dels[1].oldNum).toBe(3);
    expect(adds[0].newNum).toBe(2);
    expect(adds[1].newNum).toBe(3);
  });
});

// ── buildSideBySide ───────────────────────────────────────────────────────────

describe('buildSideBySide', () => {
  it('retourne [] pour un tableau de hunks vide', () => {
    expect(buildSideBySide([])).toEqual([]);
  });

  it('génère une ligne header par hunk', () => {
    const hunks = [{ header: '@@ -1 +1 @@', lines: [] }];
    const rows = buildSideBySide(hunks);
    expect(rows[0]).toEqual({ isHeader: true, header: '@@ -1 +1 @@' });
  });

  it('génère des lignes ctx des deux côtés', () => {
    const hunks = [{
      header: '@@ -1 +1 @@',
      lines: [{ type: 'ctx', content: 'foo', oldNum: 1, newNum: 1 }],
    }];
    const rows = buildSideBySide(hunks);
    const ctxRow = rows[1];
    expect(ctxRow.left.type).toBe('ctx');
    expect(ctxRow.right.type).toBe('ctx');
    expect(ctxRow.left.content).toBe('foo');
    expect(ctxRow.right.content).toBe('foo');
  });

  it('associe del et add en paires', () => {
    const hunks = [{
      header: '@@ -1 +1 @@',
      lines: [
        { type: 'del', content: 'ancien', oldNum: 1, newNum: null },
        { type: 'add', content: 'nouveau', oldNum: null, newNum: 1 },
      ],
    }];
    const rows = buildSideBySide(hunks);
    const dataRow = rows[1];
    expect(dataRow.left.type).toBe('del');
    expect(dataRow.left.content).toBe('ancien');
    expect(dataRow.right.type).toBe('add');
    expect(dataRow.right.content).toBe('nouveau');
  });

  it('remplit avec empty si del sans add correspondant', () => {
    const hunks = [{
      header: '@@ -1 +1 @@',
      lines: [
        { type: 'del', content: 'del1', oldNum: 1, newNum: null },
        { type: 'del', content: 'del2', oldNum: 2, newNum: null },
      ],
    }];
    const rows = buildSideBySide(hunks);
    expect(rows[1].right.type).toBe('empty');
    expect(rows[2].right.type).toBe('empty');
  });

  it('remplit avec empty si add sans del correspondant', () => {
    const hunks = [{
      header: '@@ -1 +1 @@',
      lines: [
        { type: 'add', content: 'add1', oldNum: null, newNum: 1 },
        { type: 'add', content: 'add2', oldNum: null, newNum: 2 },
      ],
    }];
    const rows = buildSideBySide(hunks);
    expect(rows[1].left.type).toBe('empty');
    expect(rows[2].left.type).toBe('empty');
  });

  it('gère 3 del pour 1 add', () => {
    const hunks = [{
      header: '@@ -1 +1 @@',
      lines: [
        { type: 'del', content: 'a', oldNum: 1, newNum: null },
        { type: 'del', content: 'b', oldNum: 2, newNum: null },
        { type: 'del', content: 'c', oldNum: 3, newNum: null },
        { type: 'add', content: 'x', oldNum: null, newNum: 1 },
      ],
    }];
    const rows = buildSideBySide(hunks);
    // header + 3 data rows
    expect(rows).toHaveLength(4);
    expect(rows[1].left.content).toBe('a');
    expect(rows[1].right.content).toBe('x');
    expect(rows[2].right.type).toBe('empty');
    expect(rows[3].right.type).toBe('empty');
  });
});

// ── buildFileTree ─────────────────────────────────────────────────────────────

describe('buildFileTree', () => {
  it('retourne un arbre vide pour une liste vide', () => {
    expect(buildFileTree([])).toEqual({ dirs: {}, files: [] });
  });

  it('place les fichiers sans répertoire à la racine', () => {
    const files = [{ path: 'README.md', status: 'modified' }];
    const tree = buildFileTree(files);
    expect(tree.files).toHaveLength(1);
    expect(tree.files[0].path).toBe('README.md');
    expect(Object.keys(tree.dirs)).toHaveLength(0);
  });

  it('place les fichiers dans le bon répertoire', () => {
    const files = [{ path: 'src/utils.js' }];
    const tree = buildFileTree(files);
    expect(tree.dirs['src']).toBeDefined();
    expect(tree.dirs['src'].files[0].path).toBe('src/utils.js');
  });

  it('gère les chemins imbriqués', () => {
    const files = [{ path: 'src/components/Button.jsx' }];
    const tree = buildFileTree(files);
    expect(tree.dirs['src'].dirs['components']).toBeDefined();
    expect(tree.dirs['src'].dirs['components'].files[0].path).toBe('src/components/Button.jsx');
  });

  it('normalise les backslashes Windows', () => {
    const files = [{ path: 'src\\utils\\helpers.js' }];
    const tree = buildFileTree(files);
    expect(tree.dirs['src']).toBeDefined();
    expect(tree.dirs['src'].dirs['utils']).toBeDefined();
  });

  it('regroupe les fichiers dans le même répertoire', () => {
    const files = [
      { path: 'src/a.js' },
      { path: 'src/b.js' },
      { path: 'src/c.js' },
    ];
    const tree = buildFileTree(files);
    expect(tree.dirs['src'].files).toHaveLength(3);
  });

  it('gère un mix racine + sous-répertoires', () => {
    const files = [
      { path: 'index.js' },
      { path: 'src/app.js' },
      { path: 'src/utils/helper.js' },
    ];
    const tree = buildFileTree(files);
    expect(tree.files).toHaveLength(1);
    expect(tree.dirs['src'].files).toHaveLength(1);
    expect(tree.dirs['src'].dirs['utils'].files).toHaveLength(1);
  });
});

// ── fileColor ─────────────────────────────────────────────────────────────────

describe('fileColor', () => {
  it('retourne gris pour untracked', () => {
    expect(fileColor({ status: 'untracked' })).toBe('#6b7280');
  });

  it('retourne rouge pour deleted', () => {
    expect(fileColor({ status: 'deleted' })).toBe('#ef4444');
  });

  it('retourne vert pour added', () => {
    expect(fileColor({ status: 'added' })).toBe('#10b981');
  });

  it('retourne vert si stagé et non-unstagé', () => {
    expect(fileColor({ staged: true, unstaged: false })).toBe('#10b981');
  });

  it('retourne orange si unstagé', () => {
    expect(fileColor({ unstaged: true })).toBe('#f59e0b');
    expect(fileColor({ staged: true, unstaged: true })).toBe('#f59e0b');
  });

  it('retourne bleu par défaut', () => {
    expect(fileColor({ status: 'modified' })).toBe('#3b82f6');
    expect(fileColor({})).toBe('#3b82f6');
  });
});

// ── fileStatusLetter ──────────────────────────────────────────────────────────

describe('fileStatusLetter', () => {
  it('retourne ? pour untracked', () => {
    expect(fileStatusLetter({ status: 'untracked' })).toBe('?');
  });

  it('retourne D pour deleted', () => {
    expect(fileStatusLetter({ status: 'deleted' })).toBe('D');
  });

  it('retourne A pour added', () => {
    expect(fileStatusLetter({ status: 'added' })).toBe('A');
  });

  it('retourne S si stagé et non-unstagé', () => {
    expect(fileStatusLetter({ staged: true, unstaged: false })).toBe('S');
  });

  it('retourne M par défaut', () => {
    expect(fileStatusLetter({ status: 'modified' })).toBe('M');
    expect(fileStatusLetter({ staged: true, unstaged: true })).toBe('M');
    expect(fileStatusLetter({})).toBe('M');
  });
});

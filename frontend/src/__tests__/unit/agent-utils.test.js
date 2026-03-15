import { describe, it, expect } from 'vitest';
import { cleanAnsi, lastLines, STATUS_COLOR } from '../../utils/agent-utils';

describe('cleanAnsi', () => {
  it('retourne une chaîne vide si input vide', () => {
    expect(cleanAnsi('')).toBe('');
  });

  it('retourne une chaîne vide si input null/undefined', () => {
    expect(cleanAnsi(null)).toBe('');
    expect(cleanAnsi(undefined)).toBe('');
  });

  it('ne modifie pas une chaîne sans séquences ANSI', () => {
    expect(cleanAnsi('hello world')).toBe('hello world');
  });

  it('supprime les codes couleur ANSI', () => {
    expect(cleanAnsi('\x1b[31mrouge\x1b[0m')).toBe('rouge');
    expect(cleanAnsi('\x1b[32mvert\x1b[0m')).toBe('vert');
    expect(cleanAnsi('\x1b[1;33mgras jaune\x1b[0m')).toBe('gras jaune');
  });

  it('supprime les séquences de déplacement de curseur', () => {
    expect(cleanAnsi('\x1b[2Jefface écran')).toBe('efface écran');
    expect(cleanAnsi('\x1b[Htexte')).toBe('texte');
  });

  it('supprime plusieurs séquences dans une même chaîne', () => {
    const input = '\x1b[32m✓\x1b[0m Tests \x1b[31m✗\x1b[0m Erreurs';
    expect(cleanAnsi(input)).toBe('✓ Tests ✗ Erreurs');
  });

  it('conserve le texte normal autour des séquences', () => {
    expect(cleanAnsi('avant\x1b[1mmilieu\x1b[0maprès')).toBe('avantmilieuaprès');
  });
});

describe('lastLines', () => {
  it('retourne une chaîne vide pour un input vide', () => {
    expect(lastLines('')).toBe('');
    expect(lastLines(null)).toBe('');
  });

  it('retourne les 4 dernières lignes par défaut', () => {
    const input = 'ligne1\nligne2\nligne3\nligne4\nligne5';
    expect(lastLines(input)).toBe('ligne2\nligne3\nligne4\nligne5');
  });

  it('respecte le paramètre n', () => {
    const input = 'a\nb\nc\nd\ne';
    expect(lastLines(input, 2)).toBe('d\ne');
    expect(lastLines(input, 1)).toBe('e');
    expect(lastLines(input, 5)).toBe('a\nb\nc\nd\ne');
  });

  it('retourne tout si moins de n lignes', () => {
    expect(lastLines('une seule ligne', 4)).toBe('une seule ligne');
    expect(lastLines('a\nb', 4)).toBe('a\nb');
  });

  it('filtre les lignes vides', () => {
    const input = 'ligne1\n\n\nligne2\n\nligne3';
    expect(lastLines(input, 10)).toBe('ligne1\nligne2\nligne3');
  });

  it('supprime les séquences ANSI avant de découper', () => {
    const input = '\x1b[32mligne1\x1b[0m\n\x1b[31mligne2\x1b[0m\nligne3\nligne4\nligne5';
    const result = lastLines(input, 3);
    expect(result).toBe('ligne3\nligne4\nligne5');
    expect(result).not.toContain('\x1b');
  });

  it('trim les espaces en fin de ligne', () => {
    expect(lastLines('ligne avec espaces   \nautre ligne  ', 4)).toBe('ligne avec espaces\nautre ligne');
  });
});

describe('STATUS_COLOR', () => {
  it('contient les couleurs pour les statuts principaux', () => {
    expect(STATUS_COLOR.running).toBeDefined();
    expect(STATUS_COLOR.completed).toBeDefined();
    expect(STATUS_COLOR.error).toBeDefined();
    expect(STATUS_COLOR.waiting).toBeDefined();
  });

  it('retourne des chaînes hexadécimales valides', () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    for (const color of Object.values(STATUS_COLOR)) {
      expect(color).toMatch(hexPattern);
    }
  });
});

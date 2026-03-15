import { describe, it, expect } from 'vitest';
import { fmtDuration } from '../../pages/Analytics';

describe('fmtDuration', () => {
  it('retourne "< 1m" pour 0', () => {
    expect(fmtDuration(0)).toBe('< 1m');
  });

  it('retourne "< 1m" pour null/undefined/falsy', () => {
    expect(fmtDuration(null)).toBe('< 1m');
    expect(fmtDuration(undefined)).toBe('< 1m');
    expect(fmtDuration(false)).toBe('< 1m');
  });

  it('retourne "< 1m" pour moins d\'une minute', () => {
    expect(fmtDuration(0.5)).toBe('< 1m');
    expect(fmtDuration(0.9)).toBe('< 1m');
  });

  it('retourne les minutes pour moins d\'une heure', () => {
    expect(fmtDuration(1)).toBe('1m');
    expect(fmtDuration(30)).toBe('30m');
    expect(fmtDuration(45)).toBe('45m');
    expect(fmtDuration(59)).toBe('59m');
  });

  it('retourne heures+minutes pour 60 min et plus', () => {
    expect(fmtDuration(60)).toBe('1h 0m');
    expect(fmtDuration(61)).toBe('1h 1m');
    expect(fmtDuration(90)).toBe('1h 30m');
    expect(fmtDuration(120)).toBe('2h 0m');
    expect(fmtDuration(125)).toBe('2h 5m');
  });

  it('arrondit les minutes à l\'entier le plus proche', () => {
    // 90.4 → 1h 30m (Math.round(30.4) = 30)
    expect(fmtDuration(90.4)).toBe('1h 30m');
    // 90.6 → 1h 31m (Math.round(30.6) = 31)
    expect(fmtDuration(90.6)).toBe('1h 31m');
  });

  it('gère les grandes valeurs', () => {
    expect(fmtDuration(1440)).toBe('24h 0m'); // 1 jour
    expect(fmtDuration(1500)).toBe('25h 0m');
  });
});

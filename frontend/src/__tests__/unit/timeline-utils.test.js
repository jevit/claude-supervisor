import { describe, it, expect } from 'vitest';
import { eventColor } from '../../pages/Timeline';

describe('eventColor', () => {
  const cases = [
    { type: 'session:registered',  expected: '#8b5cf6' },
    { type: 'session:updated',     expected: '#8b5cf6' },
    { type: 'session:removed',     expected: '#8b5cf6' },
    { type: 'terminal:output',     expected: '#22d3ee' },
    { type: 'terminal:exited',     expected: '#22d3ee' },
    { type: 'squad:started',       expected: '#f59e0b' },
    { type: 'squad:completed',     expected: '#f59e0b' },
    { type: 'lock:acquired',       expected: '#ef4444' },
    { type: 'lock:released',       expected: '#ef4444' },
    { type: 'conflict:detected',   expected: '#f97316' },
    { type: 'context:set',         expected: '#10b981' },
    { type: 'context:deleted',     expected: '#10b981' },
    { type: 'message:sent',        expected: '#3b82f6' },
    { type: 'health:ok',           expected: '#84cc16' },
    { type: 'health:fail',         expected: '#84cc16' },
  ];

  for (const { type, expected } of cases) {
    it(`retourne ${expected} pour "${type}"`, () => {
      expect(eventColor(type)).toBe(expected);
    });
  }

  it('retourne la couleur par défaut pour un type inconnu', () => {
    expect(eventColor('unknown:event')).toBe('#565f89');
    expect(eventColor('custom')).toBe('#565f89');
    expect(eventColor('')).toBe('#565f89');
  });
});

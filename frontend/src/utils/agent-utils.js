// Utilitaires partagés pour les composants de supervision d'agents

export const STATUS_COLOR = {
  running:   '#8b5cf6',
  completed: '#10b981',
  exited:    '#10b981',
  waiting:   '#64748b',
  error:     '#ef4444',
  cancelled: '#f59e0b',
};

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g; // eslint-disable-line no-control-regex

export const cleanAnsi = (s) => (s || '').replace(ANSI_RE, '');

export const lastLines = (raw, n = 4) =>
  cleanAnsi(raw).split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(-n).join('\n');

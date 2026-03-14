const { randomUUID } = require('crypto');

/**
 * ApprovalRules - Regles d'auto-approbation/rejet pour les terminaux.
 *
 * Chaque regle: { id, pattern, action: 'approve'|'reject', description, active }
 * Le terminal recupere les regles au demarrage et les applique localement.
 */
class ApprovalRules {
  constructor(store) {
    this.store = store;
    this.rules = [];

    if (this.store) {
      const saved = this.store.get('approvalRules');
      if (saved && Array.isArray(saved)) {
        this.rules = saved;
        console.log(`ApprovalRules: ${this.rules.length} regle(s) restauree(s)`);
      }
    }
  }

  _persist() {
    if (this.store) this.store.set('approvalRules', this.rules);
  }

  getAll() {
    return [...this.rules];
  }

  add(pattern, action, description = '') {
    if (!pattern || !['approve', 'reject'].includes(action)) return null;
    const rule = { id: randomUUID(), pattern, action, description, active: true, createdAt: new Date().toISOString() };
    this.rules.push(rule);
    this._persist();
    return rule;
  }

  remove(id) {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    this._persist();
    return true;
  }

  toggle(id) {
    const rule = this.rules.find((r) => r.id === id);
    if (!rule) return null;
    rule.active = !rule.active;
    this._persist();
    return rule;
  }

  /**
   * Teste un texte contre les regles actives.
   * Retourne { action: 'approve'|'reject'|null, rule }.
   */
  check(text) {
    for (const rule of this.rules) {
      if (!rule.active) continue;
      try {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(text)) return { action: rule.action, rule };
      } catch {
        if (text.toLowerCase().includes(rule.pattern.toLowerCase())) {
          return { action: rule.action, rule };
        }
      }
    }
    return { action: null, rule: null };
  }
}

module.exports = { ApprovalRules };

const { randomUUID } = require('crypto');

/**
 * SquadTemplates - Persistance des templates de squads.
 *
 * Un template stocke la configuration complète d'un squad
 * (goal, tasks, model, directory, useWorktrees) sous un nom court.
 * Il peut être rechargé dans le formulaire SquadLauncher.
 */
class SquadTemplates {
  constructor(store) {
    this.store     = store;
    this.templates = new Map();

    const saved = store.get('squadTemplates');
    if (saved && Array.isArray(saved)) {
      for (const t of saved) this.templates.set(t.id, t);
      console.log(`SquadTemplates: ${this.templates.size} template(s) restauré(s)`);
    }
  }

  _persist() {
    this.store.set('squadTemplates', [...this.templates.values()]);
  }

  getAll() {
    return [...this.templates.values()]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  get(id) {
    return this.templates.get(id) || null;
  }

  /**
   * Sauvegarder un template.
   * @param {object} opts
   * @param {string} opts.name        - Nom du template (ex: "Refactor Auth")
   * @param {object} opts.config      - Config squad: { name, goal, directory, model, useWorktrees, tasks }
   */
  save({ name, config }) {
    if (!name || !config) return null;
    const id  = randomUUID();
    const tpl = {
      id,
      name:      name.trim(),
      config:    {
        name:         config.name        || '',
        goal:         config.goal        || '',
        directory:    config.directory   || '',
        model:        config.model       || '',
        useWorktrees: config.useWorktrees ?? false,
        tasks:        Array.isArray(config.tasks) ? config.tasks : [],
      },
      createdAt: new Date().toISOString(),
    };
    this.templates.set(id, tpl);
    this._persist();
    return tpl;
  }

  remove(id) {
    if (!this.templates.has(id)) return false;
    this.templates.delete(id);
    this._persist();
    return true;
  }
}

module.exports = { SquadTemplates };

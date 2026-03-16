const { randomUUID } = require('crypto');

/**
 * SquadTemplates - Persistance des templates de squads avec versioning (#21).
 *
 * Un template stocke la configuration complète d'un squad
 * (goal, tasks, model, directory, useWorktrees) sous un nom court.
 * Chaque modification crée une nouvelle version (max 10 versions par template).
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
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }

  get(id) {
    return this.templates.get(id) || null;
  }

  /**
   * Sauvegarder un template (crée une nouvelle version si le nom existe déjà).
   * @param {object} opts
   * @param {string} opts.name        - Nom du template (ex: "Refactor Auth")
   * @param {object} opts.config      - Config squad: { name, goal, directory, model, useWorktrees, tasks }
   */
  save({ name, config }) {
    if (!name || !config) return null;

    // Chercher un template existant par nom pour créer une nouvelle version
    const existing = [...this.templates.values()].find((t) => t.name === name.trim());
    const normalizedConfig = {
      name:         config.name        || '',
      goal:         config.goal        || '',
      directory:    config.directory   || '',
      model:        config.model       || '',
      useWorktrees: config.useWorktrees ?? false,
      tasks:        Array.isArray(config.tasks) ? config.tasks : [],
    };

    if (existing) {
      // Ajouter l'ancienne config dans l'historique des versions (#21)
      const versions = existing.versions || [];
      versions.push({ config: existing.config, savedAt: existing.updatedAt || existing.createdAt });
      if (versions.length > 10) versions.shift(); // Garder les 10 dernières versions
      existing.config    = normalizedConfig;
      existing.versions  = versions;
      existing.updatedAt = new Date().toISOString();
      this._persist();
      return existing;
    }

    const id  = randomUUID();
    const tpl = {
      id,
      name:      name.trim(),
      config:    normalizedConfig,
      versions:  [], // historique des versions précédentes
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.templates.set(id, tpl);
    this._persist();
    return tpl;
  }

  /**
   * Restaurer une version antérieure d'un template (#21).
   * @param {string} id - ID du template
   * @param {number} versionIndex - Index dans le tableau versions (0 = plus ancien)
   */
  restoreVersion(id, versionIndex) {
    const tpl = this.templates.get(id);
    if (!tpl || !tpl.versions || versionIndex < 0 || versionIndex >= tpl.versions.length) return null;

    const version = tpl.versions[versionIndex];
    // Sauvegarder la version actuelle dans l'historique
    tpl.versions.push({ config: tpl.config, savedAt: tpl.updatedAt });
    if (tpl.versions.length > 10) tpl.versions.shift();
    // Restaurer
    tpl.config    = version.config;
    tpl.updatedAt = new Date().toISOString();
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

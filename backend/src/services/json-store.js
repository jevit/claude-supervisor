const fs = require('fs');
const path = require('path');

/**
 * JsonStore - Persistance JSON avec ecriture debounced.
 *
 * Stocke les donnees dans un fichier JSON unique.
 * Les ecritures sont regroupees (debounce) pour eviter les I/O excessifs.
 */
class JsonStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.debounceMs = options.debounceMs || 1000;
    this.data = {};
    this._saveTimer = null;
    this._dirty = false;

    // Creer le dossier parent si necessaire
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Charge les donnees depuis le fichier. Retourne {} si le fichier n'existe pas.
   */
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
        console.log(`JsonStore: donnees chargees depuis ${this.filePath}`);
      } else {
        this.data = {};
        console.log('JsonStore: aucun fichier existant, demarrage a vide');
      }
    } catch (err) {
      console.warn('JsonStore: erreur de lecture, demarrage a vide:', err.message);
      this.data = {};
    }
    return this.data;
  }

  /**
   * Recupere une section des donnees.
   */
  get(key) {
    return this.data[key];
  }

  /**
   * Met a jour une section et planifie une sauvegarde debounced.
   */
  set(key, value) {
    this.data[key] = value;
    this._dirty = true;
    this._scheduleSave();
  }

  /**
   * Sauvegarde immediate (synchrone). Utilisee au shutdown.
   */
  saveSync() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (!this._dirty) return;
    try {
      const tmp = this.filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.filePath);
      this._dirty = false;
    } catch (err) {
      console.error('JsonStore: erreur de sauvegarde:', err.message);
    }
  }

  /**
   * Sauvegarde asynchrone debounced.
   */
  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveSync();
    }, this.debounceMs);
  }

  /**
   * Nettoie le timer au shutdown.
   */
  destroy() {
    this.saveSync();
  }
}

module.exports = { JsonStore };

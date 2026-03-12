const { execFile } = require('child_process');
const path = require('path');

/**
 * HealthChecker - Verification periodique de la sante du projet.
 *
 * Execute des commandes de verification (build, tests, lint) a intervalles
 * reguliers et enregistre les resultats.
 */
class HealthChecker {
  constructor(broadcast, store = null) {
    this.broadcast = broadcast;
    this.store = store;
    // Map name -> { name, command, cwd, interval, timeout, timer, lastResult }
    this.checks = new Map();

    // Restaurer les checks persistes (sans les timers)
    if (this.store) {
      const saved = this.store.get('healthChecks');
      if (saved && Array.isArray(saved)) {
        for (const check of saved) {
          this.checks.set(check.name, {
            name: check.name,
            command: check.command,
            cwd: check.cwd || process.cwd(),
            interval: check.interval || 300000,
            timeout: check.timeout || 60000,
            timer: null,
            lastResult: check.lastResult || null,
          });
        }
        console.log(`HealthChecker: ${saved.length} check(s) restaure(s)`);
        // Demarrer les timers
        for (const check of this.checks.values()) {
          this._startTimer(check);
        }
      }
    }
  }

  _persist() {
    if (!this.store) return;
    const serialized = Array.from(this.checks.values()).map((c) => ({
      name: c.name,
      command: c.command,
      cwd: c.cwd,
      interval: c.interval,
      timeout: c.timeout,
      lastResult: c.lastResult,
    }));
    this.store.set('healthChecks', serialized);
  }

  /**
   * Ajoute un check et demarre le timer.
   */
  addCheck(config) {
    const check = {
      name: config.name,
      command: config.command,
      cwd: config.cwd || process.cwd(),
      interval: config.interval || 300000, // 5 min par defaut
      timeout: config.timeout || 60000,     // 1 min timeout
      timer: null,
      lastResult: null,
    };

    // Arreter l'ancien timer si le check existait deja
    const existing = this.checks.get(check.name);
    if (existing && existing.timer) {
      clearInterval(existing.timer);
    }

    this.checks.set(check.name, check);
    this._persist();
    this._startTimer(check);

    return check;
  }

  /**
   * Supprime un check et arrete son timer.
   */
  removeCheck(name) {
    const check = this.checks.get(name);
    if (!check) return false;

    if (check.timer) {
      clearInterval(check.timer);
    }
    this.checks.delete(name);
    this._persist();
    return true;
  }

  /**
   * Lance un check manuellement.
   */
  async runCheck(name) {
    const check = this.checks.get(name);
    if (!check) throw new Error(`Check "${name}" not found`);
    return this._execute(check);
  }

  /**
   * Execute un check et enregistre le resultat.
   */
  _execute(check) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Utiliser le shell pour executer la commande
      const parts = check.command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      const child = execFile(cmd, args, {
        cwd: check.cwd,
        timeout: check.timeout,
        shell: true,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        const result = {
          name: check.name,
          status: error ? 'fail' : 'pass',
          output: (stdout || '').trim().slice(-500), // Garder les 500 derniers chars
          error: error ? (stderr || error.message).trim().slice(-500) : null,
          duration,
          timestamp: new Date().toISOString(),
        };

        check.lastResult = result;
        this._persist();

        const event = result.status === 'pass' ? 'health:pass' : 'health:fail';
        this.broadcast(event, result);

        resolve(result);
      });
    });
  }

  _startTimer(check) {
    if (check.timer) clearInterval(check.timer);
    if (check.interval > 0) {
      check.timer = setInterval(() => {
        this._execute(check);
      }, check.interval);
    }
  }

  /**
   * Retourne les derniers resultats de tous les checks.
   */
  getResults() {
    return Array.from(this.checks.values()).map((c) => ({
      name: c.name,
      command: c.command,
      interval: c.interval,
      lastResult: c.lastResult,
    }));
  }

  /**
   * Arrete tous les timers (shutdown).
   */
  destroy() {
    for (const check of this.checks.values()) {
      if (check.timer) {
        clearInterval(check.timer);
        check.timer = null;
      }
    }
  }
}

module.exports = { HealthChecker };

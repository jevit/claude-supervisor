const { randomUUID } = require('crypto');

/**
 * SquadManager - Orchestrateur de squads (groupes de terminaux Claude Code).
 *
 * Chaque tâche peut déclarer des dépendances (dependsOn: ['Nom Agent A']).
 * Les agents dépendants démarrent en status 'waiting' et ne sont spawnés
 * que lorsque tous leurs prérequis sont en status completed ou exited.
 *
 * Option useWorktrees : chaque membre obtient son propre git worktree.
 */
class SquadManager {
  constructor(terminalManager, sharedContext, messageBus, broadcast, store, worktreeManager = null) {
    this.terminalManager  = terminalManager;
    this.sharedContext    = sharedContext;
    this.messageBus       = messageBus;
    this.broadcast        = broadcast;
    this.store            = store;
    this.worktreeManager  = worktreeManager;
    this.squads           = new Map();

    const saved = store.get('squads');
    if (saved && Array.isArray(saved)) {
      for (const s of saved) this.squads.set(s.id, s);
      console.log(`SquadManager: ${this.squads.size} squad(s) restaure(s)`);
    }

    this._syncTimer = setInterval(() => this._syncAll(), 5000);
  }

  _persist() {
    // Ne pas persister _spawnConfig (contient des closures potentielles)
    const serializable = [...this.squads.values()].map((squad) => ({
      ...squad,
      members: squad.members.map(({ _spawnConfig, ...m }) => m),
    }));
    this.store.set('squads', serializable);
  }

  /**
   * Créer un nouveau squad.
   * @param {object} opts
   * @param {string}  opts.name
   * @param {string}  opts.goal
   * @param {string}  [opts.directory]
   * @param {Array}   opts.tasks           - [{name, task, dependsOn?: string[]}]
   * @param {string}  [opts.model]
   * @param {boolean} [opts.autoCoordinate]
   * @param {boolean} [opts.useWorktrees]
   */
  createSquad({ name, goal, directory, tasks, model, autoCoordinate = true, useWorktrees = false }) {
    if (!name || !goal || !tasks || !Array.isArray(tasks) || tasks.length === 0) return null;

    const squadId = randomUUID();
    const useWt   = useWorktrees && !!this.worktreeManager && this.worktreeManager.isGitRepo();

    const squad = {
      id: squadId,
      name,
      goal,
      directory: directory || process.cwd(),
      model: model || null,
      autoCoordinate,
      useWorktrees: useWt,
      status: 'running',
      members: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    // Construire la liste des membres avec leur config de spawn
    for (const task of tasks) {
      const memberName = task.name || `Agent ${squad.members.length + 1}`;
      const dependsOn  = Array.isArray(task.dependsOn) ? task.dependsOn.filter(Boolean) : [];

      // Worktree optionnel
      let worktreePath = null;
      let workDir      = directory || undefined;
      if (useWt) {
        try {
          const safeName   = memberName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          const branchName = `squad/${squadId.substring(0, 8)}/${safeName}`;
          const folderName = `${squadId.substring(0, 8)}-${safeName}`;
          worktreePath = this.worktreeManager.create(branchName, folderName);
          workDir = worktreePath;
        } catch (err) {
          console.warn(`WorktreeManager: echec pour ${memberName}: ${err.message}`);
        }
      }

      const prompt = this._buildPrompt(squad, memberName, task.task, tasks, useWt);
      const spawnConfig = { directory: workDir, name: `[Squad] ${memberName}`, prompt, model: model || undefined };

      // Vérifier si les dépendances sont déjà satisfaites (cas : dépendances sur un agent qui n'existe pas)
      const validDeps = dependsOn.filter((dep) => tasks.some((t) => t.name === dep));

      const member = {
        id: null,
        name: memberName,
        task: task.task,
        dependsOn: validDeps,
        branch: useWt ? `squad/${squadId.substring(0, 8)}/${memberName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}` : null,
        worktreePath,
        status: validDeps.length > 0 ? 'waiting' : 'running',
        progress: 0,
        startedAt: validDeps.length > 0 ? null : new Date().toISOString(),
        completedAt: null,
        _spawnConfig: spawnConfig,
      };

      if (validDeps.length === 0) {
        // Spawner immédiatement
        try {
          const result = this.terminalManager.spawn(spawnConfig);
          member.id = result.terminalId;
          delete member._spawnConfig;
        } catch (err) {
          member.status = 'error';
          member.error = err.message;
          delete member._spawnConfig;
        }
      }

      squad.members.push(member);
    }

    if (autoCoordinate && this.sharedContext) {
      this.sharedContext.add(`squad:${squadId}:goal`, goal, 'squad-manager');
      this.sharedContext.add(
        `squad:${squadId}:members`,
        JSON.stringify(squad.members.map((m) => ({
          name: m.name,
          task: m.task,
          dependsOn: m.dependsOn,
          branch: m.branch,
        }))),
        'squad-manager'
      );
    }

    this.squads.set(squadId, squad);
    this._persist();
    this.broadcast('squad:created', { id: squadId, name, goal, memberCount: squad.members.length, useWorktrees: useWt });
    return squad;
  }

  /**
   * Spawner un membre en attente dont les dépendances sont désormais satisfaites.
   */
  _spawnWaitingMember(squad, member) {
    const cfg = member._spawnConfig;
    if (!cfg) return;
    try {
      const result = this.terminalManager.spawn(cfg);
      member.id = result.terminalId;
      member.status = 'running';
      member.startedAt = new Date().toISOString();
      delete member._spawnConfig;
      this.broadcast('squad:member-started', {
        squadId: squad.id,
        squadName: squad.name,
        memberName: member.name,
        terminalId: result.terminalId,
      });
    } catch (err) {
      member.status = 'error';
      member.error = err.message;
      delete member._spawnConfig;
    }
  }

  /**
   * Vérifier si des membres en attente peuvent démarrer.
   */
  _checkAndSpawnWaiting(squad) {
    const completedNames = new Set(
      squad.members
        .filter((m) => m.status === 'completed' || m.status === 'exited')
        .map((m) => m.name)
    );

    let anySpawned = false;
    for (const member of squad.members) {
      if (member.status !== 'waiting') continue;
      const allMet = member.dependsOn.every((dep) => completedNames.has(dep));
      if (allMet) {
        this._spawnWaitingMember(squad, member);
        anySpawned = true;
      }
    }
    return anySpawned;
  }

  /**
   * Construire le prompt d'un membre du squad.
   */
  _buildPrompt(squad, memberName, task, allTasks, useWorktrees) {
    const otherTasks = allTasks
      .filter((t) => (t.name || '') !== memberName)
      .map((t) => `- ${t.name || 'Agent'}: ${t.task}`)
      .join('\n');

    const worktreeNote = useWorktrees
      ? `\nBRANCHE GIT: Tu travailles sur une branche isolée. Commits libres.`
      : '';

    return `Tu es l'agent "${memberName}" dans un squad de ${allTasks.length} agents.

MISSION GLOBALE: ${squad.goal}

TA TACHE SPECIFIQUE: ${task}

Répertoire de travail: ${squad.directory}${worktreeNote}

AUTRES AGENTS DU SQUAD:
${otherTasks || '(aucun)'}

REGLES DE COORDINATION:
- Concentre-toi UNIQUEMENT sur ta tâche assignée
- Ne modifie PAS les fichiers en dehors du scope de ta tâche
- Quand tu as terminé, dis clairement "TASK COMPLETE"
- Si tu découvres quelque chose d'important pour les autres, mentionne-le clairement`;
  }

  getSquad(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return null;
    this._syncMemberStatuses(squad);
    return squad;
  }

  getAllSquads() {
    const all = [...this.squads.values()];
    for (const squad of all) this._syncMemberStatuses(squad);
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  cancelSquad(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return null;

    for (const member of squad.members) {
      if (member.id && member.status === 'running') {
        try { this.terminalManager.kill(member.id); } catch {}
        member.status = 'cancelled';
        member.completedAt = new Date().toISOString();
      }
      if (member.status === 'waiting') {
        member.status = 'cancelled';
        delete member._spawnConfig;
      }
      if (member.worktreePath && this.worktreeManager) {
        try { this.worktreeManager.remove(member.worktreePath, member.branch); } catch {}
        member.worktreePath = null;
      }
    }

    squad.status = 'cancelled';
    squad.completedAt = new Date().toISOString();
    this._persist();
    this.broadcast('squad:cancelled', { id: squadId });
    return squad;
  }

  broadcastToSquad(squadId, message) {
    const squad = this.squads.get(squadId);
    if (!squad) return 0;
    let sent = 0;
    for (const member of squad.members) {
      if (member.id && member.status === 'running') {
        try { this.terminalManager.write(member.id, message + '\n'); sent++; } catch {}
      }
    }
    return sent;
  }

  updateMemberProgress(squadId, memberId, progress) {
    const squad = this.squads.get(squadId);
    if (!squad) return null;
    const member = squad.members.find((m) => m.id === memberId);
    if (!member) return null;
    member.progress = Math.min(100, Math.max(0, progress));
    if (member.progress === 100 && member.status === 'running') {
      member.status = 'completed';
      member.completedAt = new Date().toISOString();
    }
    this._persist();
    this.broadcast('squad:updated', this._summary(squad));
    return member;
  }

  _syncMemberStatuses(squad) {
    if (squad.status === 'cancelled') return;

    let changed = false;

    for (const member of squad.members) {
      if (!member.id || member.status !== 'running') continue;

      const term = this.terminalManager.getTerminal(member.id);
      if (!term || term.status !== 'running') {
        // Terminal terminé → vérifier si "TASK COMPLETE" dans la sortie
        const buffer = this.terminalManager.getOutput(member.id, 3000) || '';
        const clean  = buffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        const taskComplete = /^(TASK|MISSION) COMPLETE/im.test(clean);
        member.status     = taskComplete ? 'completed' : 'exited';
        member.progress   = 100;
        member.completedAt = new Date().toISOString();
        changed = true;
      }
    }

    // Débloquer les agents en attente dont les dépendances sont satisfaites
    if (changed || squad.members.some((m) => m.status === 'waiting')) {
      const anySpawned = this._checkAndSpawnWaiting(squad);
      if (anySpawned) changed = true;
    }

    // Vérifier si le squad est entièrement terminé
    const waiting = squad.members.filter((m) => m.status === 'waiting').length;
    const running = squad.members.filter((m) => m.status === 'running').length;

    if (waiting === 0 && running === 0 && squad.status === 'running') {
      const completed = squad.members.filter((m) => m.status === 'completed' || m.status === 'exited').length;
      squad.status = completed === squad.members.length ? 'completed' : 'partial';
      squad.completedAt = new Date().toISOString();
      changed = true;
      this.broadcast('squad:completed', {
        id: squad.id, name: squad.name,
        completedCount: completed, totalCount: squad.members.length,
      });
    }

    if (changed) this._persist();
  }

  _syncAll() {
    for (const squad of this.squads.values()) {
      if (squad.status === 'running') this._syncMemberStatuses(squad);
    }
  }

  _summary(squad) {
    return {
      id: squad.id,
      name: squad.name,
      status: squad.status,
      useWorktrees: squad.useWorktrees,
      members: squad.members.map((m) => ({
        id: m.id,
        name: m.name,
        task: m.task,
        dependsOn: m.dependsOn,
        branch: m.branch,
        worktreePath: m.worktreePath,
        status: m.status,
        progress: m.progress,
      })),
    };
  }

  removeSquad(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return false;
    for (const member of squad.members) {
      if (member.id && member.status === 'running') {
        try { this.terminalManager.kill(member.id); } catch {}
      }
      if (member.worktreePath && this.worktreeManager) {
        try { this.worktreeManager.remove(member.worktreePath, member.branch); } catch {}
      }
    }
    this.squads.delete(squadId);
    this._persist();
    return true;
  }

  destroy() {
    if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
  }
}

module.exports = { SquadManager };

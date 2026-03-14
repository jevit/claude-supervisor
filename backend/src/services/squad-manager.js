const { randomUUID } = require('crypto');

/**
 * SquadManager - Orchestrateur de squads (groupes de terminaux Claude Code).
 *
 * Un squad = une mission decomposee en sous-taches, chaque sous-tache
 * assignee a un terminal Claude Code independant.
 */
class SquadManager {
  constructor(terminalManager, sharedContext, messageBus, broadcast, store) {
    this.terminalManager = terminalManager;
    this.sharedContext = sharedContext;
    this.messageBus = messageBus;
    this.broadcast = broadcast;
    this.store = store;
    this.squads = new Map();

    // Restaurer depuis le store
    const saved = store.get('squads');
    if (saved && Array.isArray(saved)) {
      for (const s of saved) {
        this.squads.set(s.id, s);
      }
      console.log(`SquadManager: ${this.squads.size} squad(s) restaure(s)`);
    }

    // Verifier l'etat des squads toutes les 10s
    this._syncTimer = setInterval(() => this._syncAll(), 10000);
  }

  _persist() {
    this.store.set('squads', [...this.squads.values()]);
  }

  /**
   * Creer un nouveau squad et lancer les terminaux.
   */
  createSquad({ name, goal, directory, tasks, model, autoCoordinate = true }) {
    if (!name || !goal || !tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return null;
    }

    const squadId = randomUUID();
    const squad = {
      id: squadId,
      name,
      goal,
      directory: directory || process.cwd(),
      model: model || null,
      autoCoordinate,
      status: 'running',
      members: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    // Lancer un terminal par tache
    for (const task of tasks) {
      const memberName = task.name || `Agent ${squad.members.length + 1}`;
      const prompt = this._buildPrompt(squad, memberName, task.task, tasks);

      try {
        const result = this.terminalManager.spawn({
          directory: directory || undefined,
          name: `[Squad] ${memberName}`,
          prompt,
          model: model || undefined,
        });

        squad.members.push({
          id: result.terminalId,
          name: memberName,
          task: task.task,
          status: 'running',
          progress: 0,
          startedAt: new Date().toISOString(),
          completedAt: null,
        });
      } catch (err) {
        squad.members.push({
          id: null,
          name: memberName,
          task: task.task,
          status: 'error',
          progress: 0,
          error: err.message,
          startedAt: new Date().toISOString(),
          completedAt: null,
        });
      }
    }

    // Partager le contexte du squad
    if (autoCoordinate && this.sharedContext) {
      this.sharedContext.add(`squad:${squadId}:goal`, goal, 'squad-manager');
      this.sharedContext.add(`squad:${squadId}:members`,
        JSON.stringify(squad.members.map((m) => ({ name: m.name, task: m.task }))),
        'squad-manager'
      );
    }

    this.squads.set(squadId, squad);
    this._persist();
    this.broadcast('squad:created', { id: squadId, name, goal, memberCount: squad.members.length });

    return squad;
  }

  /**
   * Construire le prompt d'un membre du squad.
   */
  _buildPrompt(squad, memberName, task, allTasks) {
    const otherTasks = allTasks
      .filter((t) => (t.name || '') !== memberName)
      .map((t) => `- ${t.name || 'Agent'}: ${t.task}`)
      .join('\n');

    return `Tu es l'agent "${memberName}" dans un squad de ${allTasks.length} agents.

MISSION GLOBALE: ${squad.goal}

TA TACHE SPECIFIQUE: ${task}

Repertoire de travail: ${squad.directory}

AUTRES AGENTS DU SQUAD:
${otherTasks || '(aucun)'}

REGLES DE COORDINATION:
- Concentre-toi UNIQUEMENT sur ta tache assignee
- Ne modifie PAS les fichiers en dehors du scope de ta tache
- Quand tu as termine, dis clairement "TASK COMPLETE"
- Si tu decouvres quelque chose d'important pour les autres, mentionne-le clairement`;
  }

  getSquad(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return null;
    this._syncMemberStatuses(squad);
    return squad;
  }

  getAllSquads() {
    const all = [...this.squads.values()];
    for (const squad of all) {
      this._syncMemberStatuses(squad);
    }
    return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Annuler un squad (tuer tous les terminaux).
   */
  cancelSquad(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return null;

    for (const member of squad.members) {
      if (member.id && member.status === 'running') {
        try {
          this.terminalManager.kill(member.id);
        } catch {}
        member.status = 'cancelled';
        member.completedAt = new Date().toISOString();
      }
    }

    squad.status = 'cancelled';
    squad.completedAt = new Date().toISOString();
    this._persist();
    this.broadcast('squad:cancelled', { id: squadId });
    return squad;
  }

  /**
   * Envoyer un message a tous les membres du squad.
   */
  broadcastToSquad(squadId, message) {
    const squad = this.squads.get(squadId);
    if (!squad) return 0;
    let sent = 0;
    for (const member of squad.members) {
      if (member.id && member.status === 'running') {
        try {
          this.terminalManager.write(member.id, message + '\n');
          sent++;
        } catch {}
      }
    }
    return sent;
  }

  /**
   * Mettre a jour la progression d'un membre.
   */
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

  /**
   * Synchroniser les statuts des membres avec le TerminalManager.
   */
  _syncMemberStatuses(squad) {
    if (squad.status === 'cancelled') return;

    let changed = false;
    for (const member of squad.members) {
      if (!member.id || member.status !== 'running') continue;
      const term = this.terminalManager.getTerminal(member.id);
      if (!term || term.status !== 'running') {
        member.status = 'exited';
        member.completedAt = new Date().toISOString();
        member.progress = 100;
        changed = true;
      }
    }

    // Verifier si le squad est termine
    const running = squad.members.filter((m) => m.status === 'running');
    if (running.length === 0 && squad.status === 'running') {
      const completed = squad.members.filter((m) => m.status === 'completed' || m.status === 'exited');
      squad.status = completed.length === squad.members.length ? 'completed' : 'partial';
      squad.completedAt = new Date().toISOString();
      changed = true;
      this.broadcast('squad:completed', {
        id: squad.id,
        name: squad.name,
        completedCount: completed.length,
        totalCount: squad.members.length,
      });
    }

    if (changed) this._persist();
  }

  _syncAll() {
    for (const squad of this.squads.values()) {
      if (squad.status === 'running') {
        this._syncMemberStatuses(squad);
      }
    }
  }

  _summary(squad) {
    return {
      id: squad.id,
      name: squad.name,
      status: squad.status,
      members: squad.members.map((m) => ({
        id: m.id,
        name: m.name,
        task: m.task,
        status: m.status,
        progress: m.progress,
      })),
    };
  }

  /**
   * Supprimer un squad termine de l'historique.
   */
  removeSquad(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return false;
    // Tuer les terminaux encore actifs
    for (const member of squad.members) {
      if (member.id && member.status === 'running') {
        try { this.terminalManager.kill(member.id); } catch {}
      }
    }
    this.squads.delete(squadId);
    this._persist();
    return true;
  }

  destroy() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }
}

module.exports = { SquadManager };

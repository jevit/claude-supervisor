const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

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
  /**
   * Vérifie s'il existe un cycle dans les dépendances (#73).
   */
  _hasCycle(tasks) {
    const graph = new Map(tasks.map((t) => [t.name, Array.isArray(t.dependsOn) ? t.dependsOn : []]));
    const visited = new Set();
    const inStack = new Set();
    const dfs = (node) => {
      if (inStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node); inStack.add(node);
      for (const dep of (graph.get(node) || [])) { if (dfs(dep)) return true; }
      inStack.delete(node);
      return false;
    };
    return tasks.some((t) => dfs(t.name));
  }

  createSquad({ name, goal, directory, tasks, model, autoCoordinate = true, useWorktrees = false, timeoutMs = null, mode = 'oneshot', rollingDelayMs = 0 }) {
    if (!name || !goal || !tasks || !Array.isArray(tasks) || tasks.length === 0) return null;
    if (this._hasCycle(tasks)) throw new Error('Dépendances cycliques détectées dans les tâches du squad');

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
      timeoutMs: timeoutMs ? parseInt(timeoutMs, 10) : null, // timeout global (#13)
      mode: mode === 'rolling' ? 'rolling' : 'oneshot', // mode de relance (#77)
      rollingDelayMs: parseInt(rollingDelayMs, 10) || 0,
      rollingIteration: 0, // compteur de relances
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

      // Spawner l'agent coordinateur si le squad a au moins 2 membres
      if (tasks.length >= 2) {
        this._spawnCoordinator(squad, tasks);
      }
    }

    // Créer le fichier SQUAD.md de coordination dans le répertoire du squad
    try {
      const squadMdPath = path.join(squad.directory, 'SQUAD.md');
      const agentLines = tasks
        .map((t) => `## ${t.name || 'Agent'}\n- **Tâche** : ${t.task}\n- **Statut** : ⏳ en attente de démarrage${t.dependsOn?.length ? `\n- **Attend** : ${t.dependsOn.join(', ')}` : ''}\n`)
        .join('\n');
      const content = `# Squad : ${name}\n\n**Objectif** : ${goal}  \n**Démarré le** : ${new Date().toLocaleString('fr-FR')}\n\n---\n\n${agentLines}\n---\n*Ce fichier est mis à jour par chaque agent au fil de sa progression.*\n`;
      fs.writeFileSync(squadMdPath, content, 'utf8');
    } catch (err) {
      console.warn(`SquadManager: impossible de créer SQUAD.md: ${err.message}`);
    }

    this.squads.set(squadId, squad);
    this._persist();
    this.broadcast('squad:created', { id: squadId, name, goal, memberCount: squad.members.length, useWorktrees: useWt });
    return squad;
  }

  /**
   * Extrait et nettoie la sortie utile d'un terminal (supprime ANSI, lignes vides, prompts shell).
   */
  _extractOutput(terminalId, maxChars = 3000) {
    const raw = this.terminalManager.getOutput(terminalId, maxChars + 500) || '';
    return raw
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // codes ANSI
      .replace(/\r/g, '')
      .split('\n')
      .filter((l) => l.trim() && !/^(\$|>|#|❯|➜)\s/.test(l.trim())) // prompts shell
      .join('\n')
      .trim()
      .slice(-maxChars);
  }

  /**
   * Spawner un membre en attente dont les dépendances sont désormais satisfaites.
   * Injecte les sorties des agents terminés dans le prompt.
   */
  _spawnWaitingMember(squad, member) {
    const cfg = member._spawnConfig;
    if (!cfg) return;

    // Injecter les résultats des agents dont ce membre dépend
    // Source 1 : SharedContext (résumé structuré posé par l'agent via MCP)
    // Source 2 : buffer terminal (fallback si pas de résumé MCP)
    const depOutputs = member.dependsOn
      .map((depName) => {
        const dep = squad.members.find((m) => m.name === depName);
        if (!dep?.id) return null;

        // Préférer le résumé MCP si disponible
        const ctxKey = `squad:result:${depName}`;
        const ctxEntry = this.sharedContext?.get(ctxKey);
        const structured = ctxEntry?.value;

        const output = structured || this._extractOutput(dep.id);
        if (!output) return null;

        const source = structured ? '(résumé structuré)' : '(sortie terminal)';
        return `\n\n=== RÉSULTATS DE L'AGENT "${depName}" ${source} ===\n${output}\n=== FIN RÉSULTATS ${depName} ===`;
      })
      .filter(Boolean)
      .join('\n');

    if (depOutputs) {
      cfg.prompt += `\n\n---\nCONTEXTE DES AGENTS PRÉCÉDENTS (utilise ces résultats comme base de travail) :${depOutputs}`;
    }

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
   * Spawner l'agent coordinateur du squad.
   * Il surveille la progression, relaie les blocages et alerte sur les conflits.
   */
  _spawnCoordinator(squad, tasks) {
    const memberNames = tasks.map((t) => t.name || 'Agent').join(', ');
    const memberList  = tasks
      .map((t) => `- ${t.name || 'Agent'} : ${t.task}${t.dependsOn?.length ? ` (attend: ${t.dependsOn.join(', ')})` : ''}`)
      .join('\n');

    const prompt = `Tu es le COORDINATEUR du squad "${squad.name}".
Tu ne codes pas — tu supervises, débloques et facilites la communication.

MISSION GLOBALE: ${squad.goal}

AGENTS SOUS TA SUPERVISION:
${memberList}

TES RESPONSABILITÉS:
1. Vérifier régulièrement la progression via supervisor_get_context (clé "squad:result:NomAgent")
2. Si un agent semble bloqué, lui envoyer un message d'aide via supervisor_send_message
3. Détecter les conflits potentiels (deux agents modifiant les mêmes fichiers) et alerter
4. Quand tous les agents ont terminé (clé "squad:result:*" renseignées), produire une synthèse finale
5. Écrire la synthèse dans SharedContext : supervisor_set_context clé "squad:result:Coordinateur"

AGENTS À SUPERVISER: ${memberNames}

Commence par attendre 60 secondes, puis vérifie la progression. Répète toutes les 2 minutes.
Quand le squad est terminé, dis "TASK COMPLETE".`;

    try {
      const result = this.terminalManager.spawn({
        directory: squad.directory,
        name: `[Squad] Coordinateur`,
        prompt,
        model: squad.model || undefined,
      });

      // Ajouter comme membre spécial (non bloquant pour la complétion du squad)
      squad.members.push({
        id: result.terminalId,
        name: 'Coordinateur',
        task: 'Supervision et coordination du squad',
        dependsOn: [],
        branch: null,
        worktreePath: null,
        status: 'running',
        progress: 0,
        isCoordinator: true,
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
    } catch (err) {
      console.warn(`SquadManager: echec spawn coordinateur: ${err.message}`);
    }
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

    const otherNames = allTasks.filter((t) => (t.name || '') !== memberName).map((t) => t.name || 'Agent');

    return `Tu es l'agent "${memberName}" dans un squad de ${allTasks.length} agents.

MISSION GLOBALE: ${squad.goal}

TA TACHE SPECIFIQUE: ${task}

Répertoire de travail: ${squad.directory}${worktreeNote}

AUTRES AGENTS DU SQUAD:
${otherTasks || '(aucun)'}

FICHIER DE COORDINATION PARTAGÉ:
- Lis ${squad.directory}/SQUAD.md au démarrage (si existant) pour voir la progression des autres
- Mets-le à jour quand tu démarres ("🔄 en cours"), et à la fin ("✅ terminé — résumé court")
- Ne pas supprimer les sections des autres agents

COMMUNICATION INTER-AGENTS (outils MCP disponibles):
- Partager un résultat intermédiaire : supervisor_set_context avec clé "squad:result:${memberName}" et ta valeur
- Lire ce qu'ont produit les autres : supervisor_get_context avec clé "squad:result:NomAgent"${otherNames.length ? `\n  Agents disponibles : ${otherNames.join(', ')}` : ''}
- Signaler un bloqueur ou envoyer un message : supervisor_send_message avec to="NomAgent" ou to="all"
- Lire tes messages entrants : supervisor_get_context avec clé "squad:msg:${memberName}"

REGLES DE COORDINATION:
- Concentre-toi UNIQUEMENT sur ta tâche assignée
- Ne modifie PAS les fichiers en dehors du scope de ta tâche
- Écris tes résultats clés dans SharedContext (supervisor_set_context) avant de terminer
- Quand tu as terminé, dis clairement "TASK COMPLETE"
- Si tu découvres quelque chose d'important pour les autres, utilise supervisor_send_message`;
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
        try { this.terminalManager.kill(member.id); } catch (err) {
          console.warn(`SquadManager: echec kill terminal ${member.id}: ${err.message}`);
        }
        member.status = 'cancelled';
        member.completedAt = new Date().toISOString();
      }
      if (member.status === 'waiting') {
        member.status = 'cancelled';
        delete member._spawnConfig;
      }
      if (member.worktreePath && this.worktreeManager) {
        try { this.worktreeManager.remove(member.worktreePath, member.branch); } catch (err) {
          console.warn(`SquadManager: echec remove worktree ${member.worktreePath}: ${err.message}`);
        }
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
        try { this.terminalManager.write(member.id, message + '\n'); sent++; } catch (err) {
          console.warn(`SquadManager: echec write terminal ${member.id}: ${err.message}`);
        }
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

        // Partager le résultat dans le contexte partagé (#78)
        if (taskComplete && this.sharedContext) {
          const lines = clean.split('\n').filter((l) => l.trim());
          const excerpt = lines.slice(-20).join('\n').substring(0, 1000);
          this.sharedContext.add(
            `squad:${squad.id}/results/${member.name}`,
            excerpt,
            'squad-manager',
          );
        }
      }
    }

    // Débloquer les agents en attente dont les dépendances sont satisfaites
    if (changed || squad.members.some((m) => m.status === 'waiting')) {
      const anySpawned = this._checkAndSpawnWaiting(squad);
      if (anySpawned) changed = true;
    }

    // Vérifier si le squad est entièrement terminé (exclure le coordinateur du décompte)
    const workers = squad.members.filter((m) => !m.isCoordinator);
    const waiting = workers.filter((m) => m.status === 'waiting').length;
    const running = workers.filter((m) => m.status === 'running').length;

    if (waiting === 0 && running === 0 && squad.status === 'running') {
      const completed = workers.filter((m) => m.status === 'completed' || m.status === 'exited').length;

      // Mode rolling : relancer tous les workers après le délai configuré (#77)
      if (squad.mode === 'rolling') {
        squad.rollingIteration = (squad.rollingIteration || 0) + 1;
        this.broadcast('squad:rolling', { id: squad.id, name: squad.name, iteration: squad.rollingIteration });
        const delay = squad.rollingDelayMs || 0;
        setTimeout(() => {
          const s = this.squads.get(squad.id);
          if (!s || s.status !== 'running') return;
          // Reconstruire la liste de tâches pour _buildPrompt
          const allTasks = s.members
            .filter((mem) => !mem.isCoordinator)
            .map((mem) => ({ name: mem.name, task: mem.task, dependsOn: mem.dependsOn }));

          for (const m of s.members.filter((m) => !m.isCoordinator)) {
            m.status = 'running';
            m.progress = 0;
            m.startedAt = new Date().toISOString();
            m.completedAt = null;
            try {
              // _spawnConfig est supprimé après le spawn initial — reconstruire comme retryMember
              const prompt  = this._buildPrompt(s, m.name, m.task, allTasks, !!m.worktreePath);
              const workDir = m.worktreePath || s.directory;
              const newId   = this.terminalManager.spawn({
                directory: workDir,
                name: `[Squad] ${m.name}`,
                prompt,
                model: s.model || undefined,
              }).terminalId;
              m.id = newId;
            } catch (e) {
              console.warn(`SquadManager rolling: respawn echec ${m.name}: ${e.message}`);
              m.status = 'error';
            }
          }
          this._persist();
          this.broadcast('squad:updated', this._summary(s));
        }, delay);
      } else {
        squad.status = completed === workers.length ? 'completed' : 'partial';
        squad.completedAt = new Date().toISOString();
        this.broadcast('squad:completed', {
          id: squad.id, name: squad.name,
          completedCount: completed, totalCount: squad.members.length,
        });
      }
      changed = true;
    }

    if (changed) this._persist();
  }

  _syncAll() {
    if (this._syncing) return;
    this._syncing = true;
    try {
      for (const squad of this.squads.values()) {
        if (squad.status !== 'running') continue;
        // Vérifier le timeout global (#13)
        if (squad.timeoutMs && Date.now() - new Date(squad.createdAt).getTime() > squad.timeoutMs) {
          console.warn(`SquadManager: timeout atteint pour ${squad.id} (${squad.timeoutMs}ms) — annulation`);
          this.cancelSquad(squad.id);
          this.broadcast('squad:timeout', { id: squad.id, name: squad.name, timeoutMs: squad.timeoutMs });
          continue;
        }
        this._syncMemberStatuses(squad);
      }
    } finally {
      this._syncing = false;
    }
  }

  _summary(squad) {
    return {
      id: squad.id,
      name: squad.name,
      status: squad.status,
      useWorktrees: squad.useWorktrees,
      mode: squad.mode || 'oneshot',
      rollingIteration: squad.rollingIteration || 0,
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

  /**
   * Relancer un membre en erreur ou exited (#12).
   */
  retryMember(squadId, memberName) {
    const squad = this.squads.get(squadId);
    if (!squad || squad.status === 'cancelled') return null;

    const member = squad.members.find((m) => m.name === memberName);
    if (!member) return null;
    if (!['error', 'exited'].includes(member.status)) return null;

    // Tuer l'ancien terminal si encore vivant
    if (member.id) {
      try { this.terminalManager.kill(member.id); } catch {}
    }

    // Reconstruire la liste de toutes les tâches à partir des membres
    const allTasks = squad.members
      .filter((m) => !m.isCoordinator)
      .map((m) => ({ name: m.name, task: m.task, dependsOn: m.dependsOn }));

    const prompt = this._buildPrompt(squad, memberName, member.task, allTasks, !!member.worktreePath);
    const workDir = member.worktreePath || squad.directory;

    try {
      const result = this.terminalManager.spawn({
        directory: workDir,
        name: `[Squad] ${memberName}`,
        prompt,
        model: squad.model || undefined,
      });
      member.id         = result.terminalId;
      member.status     = 'running';
      member.progress   = 0;
      member.startedAt  = new Date().toISOString();
      member.completedAt = null;
      member.error      = undefined;

      // Remettre le squad en running si nécessaire
      if (squad.status !== 'running') {
        squad.status       = 'running';
        squad.completedAt  = null;
      }

      this._persist();
      this.broadcast('squad:member-started', { squadId, squadName: squad.name, memberName, terminalId: result.terminalId });
      return member;
    } catch (err) {
      member.status = 'error';
      member.error  = err.message;
      this._persist();
      return null;
    }
  }

  removeSquad(squadId) {
    const squad = this.squads.get(squadId);
    if (!squad) return false;
    for (const member of squad.members) {
      if (member.id && member.status === 'running') {
        try { this.terminalManager.kill(member.id); } catch (err) {
          console.warn(`SquadManager: echec kill terminal ${member.id}: ${err.message}`);
        }
      }
      if (member.worktreePath && this.worktreeManager) {
        try { this.worktreeManager.remove(member.worktreePath, member.branch); } catch (err) {
          console.warn(`SquadManager: echec remove worktree ${member.worktreePath}: ${err.message}`);
        }
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

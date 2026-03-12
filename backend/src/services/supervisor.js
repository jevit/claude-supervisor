// Anthropic SDK est optionnel - le superviseur fonctionne sans cle API
let Anthropic;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch {
  // SDK non disponible
}

class AgentSupervisor {
  constructor(broadcast, store = null) {
    this.broadcast = broadcast;
    this.store = store;
    this.agents = new Map();
    this.tasks = [];
    this.client = null;

    if (Anthropic && process.env.ANTHROPIC_API_KEY) {
      try {
        this.client = new Anthropic();
      } catch {
        console.warn('Anthropic SDK: impossible de creer le client (cle API manquante ou invalide)');
      }
    }

    // Restaurer les donnees persistees
    if (this.store) {
      const saved = this.store.get('agents');
      if (saved && Array.isArray(saved)) {
        for (const agent of saved) {
          this.agents.set(agent.id, agent);
        }
        console.log(`Supervisor: ${saved.length} agent(s) restaure(s)`);
      }
      const savedTasks = this.store.get('tasks');
      if (savedTasks && Array.isArray(savedTasks)) {
        this.tasks = savedTasks;
        console.log(`Supervisor: ${savedTasks.length} tache(s) restauree(s)`);
      }
    }
  }

  _persist() {
    if (!this.store) return;
    this.store.set('agents', Array.from(this.agents.values()));
    this.store.set('tasks', this.tasks);
  }

  createAgent(id, config) {
    const agent = {
      id,
      name: config.name,
      role: config.role,
      model: config.model || 'claude-sonnet-4-5-20250929',
      systemPrompt: config.systemPrompt || '',
      status: 'idle',
      taskHistory: [],
      createdAt: new Date().toISOString(),
    };
    this.agents.set(id, agent);
    this._persist();
    this.broadcast('agent:created', agent);
    return agent;
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  removeAgent(id) {
    const agent = this.agents.get(id);
    if (agent) {
      this.agents.delete(id);
      this._persist();
      this.broadcast('agent:removed', { id });
    }
    return agent;
  }

  async assignTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (!this.client) throw new Error('Anthropic API non disponible (cle API manquante)');

    agent.status = 'working';
    task.assignedTo = agentId;
    task.status = 'in_progress';
    task.startedAt = new Date().toISOString();
    this.tasks.push(task);
    this._persist();

    this.broadcast('task:started', { agentId, task });

    try {
      const response = await this.client.messages.create({
        model: agent.model,
        max_tokens: 4096,
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: task.prompt }],
      });

      const result = response.content[0].text;
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date().toISOString();
      agent.status = 'idle';
      agent.taskHistory.push(task.id);
      this._persist();

      this.broadcast('task:completed', { agentId, task });
      return { task, result };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      agent.status = 'error';
      this._persist();

      this.broadcast('task:failed', { agentId, task, error: error.message });
      throw error;
    }
  }

  getTasks(filter = {}) {
    let result = [...this.tasks];
    if (filter.status) result = result.filter((t) => t.status === filter.status);
    if (filter.agentId) result = result.filter((t) => t.assignedTo === filter.agentId);
    return result;
  }
}

module.exports = { AgentSupervisor };

const Anthropic = require('@anthropic-ai/sdk');

class AgentSupervisor {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.agents = new Map();
    this.tasks = [];
    this.client = new Anthropic();
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
      this.broadcast('agent:removed', { id });
    }
    return agent;
  }

  async assignTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.status = 'working';
    task.assignedTo = agentId;
    task.status = 'in_progress';
    task.startedAt = new Date().toISOString();
    this.tasks.push(task);

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

      this.broadcast('task:completed', { agentId, task });
      return { task, result };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      agent.status = 'error';

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

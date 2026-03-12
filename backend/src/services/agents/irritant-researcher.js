const Anthropic = require('@anthropic-ai/sdk');

/**
 * Agent specialise dans la recherche d'irritants lies a l'utilisation
 * de Claude Code en mode multi-terminal / taches paralleles.
 *
 * Identifie les points de friction, limitations et frustrations
 * des utilisateurs pour alimenter la roadmap du superviseur.
 */

class IrritantResearcher {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.client = new Anthropic();
    this.irritants = [];
    this.categories = [
      'context_loss',        // Perte de contexte entre sessions
      'coordination',        // Difficulte a coordonner les taches
      'visibility',          // Manque de visibilite sur l'etat global
      'conflict',            // Conflits entre modifications paralleles
      'cognitive_load',      // Surcharge cognitive pour l'utilisateur
      'communication',       // Communication inter-sessions defaillante
      'state_management',    // Gestion d'etat entre terminaux
      'error_propagation',   // Propagation d'erreurs entre taches
    ];
  }

  /**
   * Lance une recherche d'irritants basee sur les sessions actives.
   */
  async analyzeSessionsForIrritants(sessions) {
    const prompt = `Tu es un expert UX specialise dans les outils de developpement.

Analyse les sessions Claude Code paralleles suivantes et identifie les IRRITANTS
(points de friction, frustrations, limitations) pour un utilisateur qui travaille
sur plusieurs terminaux Claude en meme temps.

Sessions actives:
${JSON.stringify(sessions, null, 2)}

Categories d'irritants a explorer:
${this.categories.map((c) => `- ${c}`).join('\n')}

Pour chaque irritant identifie, donne:
1. Categorie
2. Description du probleme
3. Impact (1-5)
4. Solution proposee pour le superviseur

Reponds en JSON: { "irritants": [{ "category", "description", "impact", "solution" }] }`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const result = JSON.parse(response.content[0].text);
      this.irritants.push(...result.irritants);
      this.broadcast('irritants:found', result.irritants);
      return result.irritants;
    } catch (error) {
      this.broadcast('irritants:error', { error: error.message });
      throw error;
    }
  }

  /**
   * Recherche les irritants connus de la communaute (bases sur les patterns courants).
   */
  async researchKnownIrritants() {
    const knownIrritants = [
      {
        category: 'context_loss',
        description: "Chaque terminal Claude Code a son propre contexte. Quand on switche entre terminaux, il faut re-expliquer le contexte global du projet.",
        impact: 5,
        solution: "Contexte partage entre sessions via le superviseur. Un fichier de contexte global mis a jour en temps reel.",
      },
      {
        category: 'visibility',
        description: "Impossible de voir d'un coup d'oeil ce que fait chaque session Claude. Il faut aller dans chaque terminal un par un.",
        impact: 5,
        solution: "Dashboard avec vue globale de toutes les sessions, etat en temps reel, et recap consolide.",
      },
      {
        category: 'coordination',
        description: "Pas de mecanisme pour eviter que deux sessions modifient le meme fichier simultanement.",
        impact: 4,
        solution: "Systeme de locks de fichiers et alertes de conflits potentiels dans le dashboard.",
      },
      {
        category: 'conflict',
        description: "Les merge conflicts git sont frequents quand plusieurs sessions committent en parallele.",
        impact: 4,
        solution: "Detection precoce de conflits et orchestration des commits par le superviseur.",
      },
      {
        category: 'cognitive_load',
        description: "L'utilisateur doit mentalement tracker l'etat de 3-5+ sessions en meme temps.",
        impact: 5,
        solution: "Recap automatique, notifications intelligentes, et timeline unifiee des actions.",
      },
      {
        category: 'communication',
        description: "Les sessions ne peuvent pas communiquer entre elles. Si une session decouvre un probleme qui affecte une autre, il n'y a pas de canal.",
        impact: 4,
        solution: "Bus de messages inter-sessions via le superviseur, avec alertes automatiques.",
      },
      {
        category: 'state_management',
        description: "Quand une session installe un package ou modifie la config, les autres sessions ne le savent pas.",
        impact: 3,
        solution: "Detection des changements d'environnement et notification aux sessions concernees.",
      },
      {
        category: 'error_propagation',
        description: "Si une session casse le build, les autres sessions continuent a travailler sur une base cassee sans le savoir.",
        impact: 4,
        solution: "Health check continu du projet et alerte globale en cas de regression.",
      },
    ];

    this.irritants = knownIrritants;
    this.broadcast('irritants:loaded', knownIrritants);
    return knownIrritants;
  }

  getAll() {
    return this.irritants;
  }

  getByCategory(category) {
    return this.irritants.filter((i) => i.category === category);
  }

  getHighImpact(minImpact = 4) {
    return this.irritants.filter((i) => i.impact >= minImpact);
  }
}

module.exports = { IrritantResearcher };

const express = require('express');
const router = express.Router();

// Lister tous les squads
router.get('/', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  res.json(squadManager.getAllSquads());
});

// Creer un nouveau squad
router.post('/', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  const { name, goal, directory, tasks, model, autoCoordinate, useWorktrees, timeoutMs, mode, rollingDelayMs } = req.body;
  let squad;
  try {
    squad = squadManager.createSquad({ name, goal, directory, tasks, model, autoCoordinate, useWorktrees, timeoutMs, mode, rollingDelayMs });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!squad) {
    return res.status(400).json({ error: 'name, goal et tasks (tableau) sont requis' });
  }
  res.status(201).json(squad);
});

// Detailler un squad
router.get('/:id', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  const squad = squadManager.getSquad(req.params.id);
  if (!squad) return res.status(404).json({ error: 'Squad introuvable' });
  res.json(squad);
});

// Annuler un squad
router.delete('/:id', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  const squad = squadManager.cancelSquad(req.params.id);
  if (!squad) return res.status(404).json({ error: 'Squad introuvable' });
  res.json(squad);
});

// Supprimer un squad de l'historique
router.delete('/:id/remove', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  const ok = squadManager.removeSquad(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Squad introuvable' });
  res.json({ removed: true });
});

// Envoyer un message a tous les membres du squad
router.post('/:id/broadcast', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message requis' });
  const sent = squadManager.broadcastToSquad(req.params.id, message);
  res.json({ sent });
});

// Relancer un membre en erreur (#12)
router.post('/:id/members/:memberName/retry', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  const member = squadManager.retryMember(req.params.id, req.params.memberName);
  if (!member) return res.status(400).json({ error: 'Membre introuvable ou non relançable' });
  res.json(member);
});

// Mettre a jour la progression d'un membre
router.post('/:id/members/:memberId/progress', (req, res) => {
  const squadManager = req.app.locals.squadManager;
  const { progress } = req.body;
  const member = squadManager.updateMemberProgress(req.params.id, req.params.memberId, progress);
  if (!member) return res.status(404).json({ error: 'Squad ou membre introuvable' });
  res.json(member);
});

module.exports = router;

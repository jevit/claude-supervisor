# Irritants identifies - Utilisation parallele de Claude Code

## Synthese

Ce document recense les principaux points de friction rencontres par les utilisateurs
qui travaillent avec plusieurs sessions Claude Code en parallele.

## Irritants par categorie

### Perte de contexte (impact: 5/5)
- Chaque terminal a son propre contexte isole
- Switcher entre terminaux oblige a re-expliquer le contexte
- **Solution**: Contexte partage via le superviseur, fichier de contexte global temps reel

### Visibilite (impact: 5/5)
- Impossible de voir l'etat global d'un coup d'oeil
- Obligation de naviguer terminal par terminal
- **Solution**: Dashboard avec recap consolide, etats en temps reel

### Surcharge cognitive (impact: 5/5)
- L'utilisateur doit tracker mentalement 3-5+ sessions
- Risque d'oublier ce que fait une session
- **Solution**: Recap automatique, notifications intelligentes, timeline unifiee

### Coordination (impact: 4/5)
- Pas de mecanisme de lock de fichiers
- Deux sessions peuvent modifier le meme fichier
- **Solution**: Systeme de locks et alertes de conflits dans le dashboard

### Conflits Git (impact: 4/5)
- Merge conflicts frequents avec commits paralleles
- **Solution**: Detection precoce et orchestration des commits

### Communication inter-sessions (impact: 4/5)
- Les sessions ne peuvent pas communiquer entre elles
- Decouverte d'un probleme = pas de canal pour alerter les autres
- **Solution**: Bus de messages inter-sessions avec alertes automatiques

### Propagation d'erreurs (impact: 4/5)
- Un build casse dans une session est invisible aux autres
- Les autres sessions travaillent sur une base corrompue
- **Solution**: Health check continu et alerte globale en cas de regression

### Gestion d'etat (impact: 3/5)
- Changements d'environnement (packages, config) non propages
- **Solution**: Detection des changements et notification aux sessions

## Priorisation

| Priorite | Fonctionnalite | Irritant adresse |
|----------|---------------|-----------------|
| P0 | Dashboard recap temps reel | Visibilite, Surcharge cognitive |
| P0 | Tracking des sessions | Visibilite |
| P1 | Alertes de conflits fichiers | Coordination, Conflits |
| P1 | Bus de messages inter-sessions | Communication |
| P2 | Health check projet | Propagation d'erreurs |
| P2 | Contexte partage | Perte de contexte |
| P3 | Orchestration commits | Conflits Git |
| P3 | Detection changements env | Gestion d'etat |

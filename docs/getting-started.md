# Guide de demarrage

## Prerequis
- Node.js >= 18
- npm >= 9
- Une cle API Anthropic

## Installation

```bash
# Cloner le projet
cd claude-supervisor

# Installer les dependances backend
cd backend
npm install
cp .env.example .env
# Editer .env et ajouter votre ANTHROPIC_API_KEY

# Installer les dependances frontend
cd ../frontend
npm install
```

## Lancement

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Le dashboard est accessible sur `http://localhost:3000`

## Utilisation

1. Ouvrir le dashboard dans le navigateur
2. Les sessions Claude Code actives apparaissent automatiquement
3. Le recap global en haut de page montre l'etat consolide
4. Chaque carte de session affiche:
   - Le nom et repertoire de travail
   - La tache en cours
   - L'etat de reflexion
   - Les actions recentes

## API REST

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | Etat du serveur |
| GET | `/api/agents` | Liste des agents |
| POST | `/api/agents` | Creer un agent |
| DELETE | `/api/agents/:id` | Supprimer un agent |
| GET | `/api/tasks` | Liste des taches |
| POST | `/api/tasks` | Assigner une tache |
| GET | `/api/sessions/recap` | Recap global |

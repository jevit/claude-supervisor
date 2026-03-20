---
name: Architecture claude-supervisor
description: Décisions architecturales et patterns établis dans claude-supervisor
type: project
---

Application de supervision de sessions Claude Code. Stack Node.js + Express + WebSocket (port 3001) + React + Vite (port 3000) + serveur MCP stdio.

**Décisions architecturales clés :**
- `broadcast()` dans `index.js` est le hub central WS — toute communication passe par là
- Singleton WebSocket côté frontend (`websocket.js`) : N composants = 1 seule connexion
- Séparation services/routes claire : la logique métier est dans `services/`, les routes ne font que déléguer
- Persistance JSON debounced via `JsonStore` — tous les services reçoivent le store en injection
- Rate limiting manuel sur le spawn des terminaux (10/min), pas de middleware tiers
- `apiFetch` wrapper centralisé côté frontend depuis `api.js` mais non utilisé de façon cohérente dans tout le frontend

**Why:** Simplicité avant tout — pas de TypeScript, pas de base de données relationnelle, JSON store suffisant pour l'usage.

**How to apply:** Ne pas introduire de middleware d'auth tiers ou d'ORM — garder la stack légère.

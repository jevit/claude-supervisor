# MCP Server — Claude Supervisor

Serveur MCP (Model Context Protocol) en stdio, exposant les outils `supervisor_*` aux sessions Claude Code.

## Lancement

Configuré automatiquement via `.mcp.json` à la racine — Claude Code le démarre en stdio.

## Outils exposés

| Outil | Description |
|-------|-------------|
| `supervisor_set_status` | Mettre à jour le statut de la session (running, waiting, idle...) |
| `supervisor_set_thinking` | Signaler une réflexion en cours (texte affiché dans le dashboard) |
| `supervisor_report_task` | Déclarer la tâche courante |
| `supervisor_log_action` | Journaliser une action dans l'EventLog |
| `supervisor_get_context` | Lire une ou toutes les entrées du contexte partagé |
| `supervisor_set_context` | Écrire une entrée dans le contexte partagé |
| `supervisor_lock_file` | Poser un lock soft sur un fichier |
| `supervisor_unlock_file` | Relâcher un lock |
| `supervisor_send_message` | Envoyer un message à une autre session |
| `supervisor_get_messages` | Lire les messages reçus |
| `supervisor_get_sessions` | Lister les sessions actives |
| `supervisor_get_conflicts` | Lire les conflits détectés |
| `supervisor_health_status` | Statut de santé du supervisor |
| `supervisor_git_enqueue` | Ajouter une opération git à la file |
| `supervisor_git_complete` | Marquer une opération git comme terminée |

## Variables d'environnement

```env
SUPERVISOR_URL=http://localhost:3001    # URL du backend
SESSION_DIR=C:/Perso/Workspace3        # Répertoire de travail par défaut
```

`SESSION_NAME` est laissé vide — chaque session le renseigne dynamiquement.

## Dépendances

- `@modelcontextprotocol/sdk` — SDK MCP officiel
- `zod` — validation des paramètres des outils

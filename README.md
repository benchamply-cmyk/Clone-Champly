# Champly Assistant

Assistant IA personnel de Ben, hébergé sur champly.fr et construit sur l'API Claude.
Ce dépôt suit le document d'architecture « Agent IA personnel Champly – Architecture et fonctionnalités ».

## Ce que fait ce squelette

- **Chef de cabinet** (`src/agents/chief.ts`) : reçoit toutes les demandes, raisonne avec Claude Opus 5.5,
  fait lui-même ce qui est court et délègue le reste.
- **Cinq agents spécialisés** (`src/agents/specialists.ts`) : secrétaire (Claude Haiku 5.5), développeur,
  chercheur, stratège, rédacteur (Claude Opus 5.5). Recherche web intégrée pour ceux qui en ont besoin.
- **Mémoire** (`src/memory/store.ts`) : profil de Ben, fiches projets, journal des échanges, savoir-faire.
  L'agent l'enrichit lui-même avec ses outils ; Ben peut tout consulter, verrouiller ou supprimer.
- **Garde-fous** (`src/tools/guardrails.ts`) : toute action externe (envoyer, publier, fusionner, inviter)
  part dans une file de validation ; payer et supprimer en masse sont interdits.
- **Briefing du matin** (`src/jobs/morning-brief.ts`) : état des projets, actions en attente, 3 priorités du jour.
- **Passerelle HTTP** (`src/server.ts`, Fastify) protégée par un jeton secret.

## Démarrer en local

Prérequis : Node.js 22 ou plus, une clé API Claude.

```bash
npm install
cp .env.example .env   # puis renseigner ANTHROPIC_API_KEY et ASSISTANT_TOKEN
set -a; . ./.env; set +a
npm run dev
```

Parler à l'assistant :

```bash
curl -s localhost:3000/api/chat \
  -H "Authorization: Bearer $ASSISTANT_TOKEN" -H "content-type: application/json" \
  -d '{"message":"Bonjour, je veux lancer un nouveau projet sur champly.fr"}'
```

Réutiliser le `conversationId` renvoyé pour continuer la même conversation.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/health` | Vérifie que le service tourne (sans jeton) |
| POST | `/api/chat` | `{ message, conversationId? }` → `{ conversationId, answer }` |
| GET | `/api/memoire` | Ce que l'assistant sait de Ben : profil, projets, savoir-faire |
| POST | `/api/memoire/profil/:id/verrou` | `{ locked }` : verrouiller ou déverrouiller un fait |
| DELETE | `/api/memoire/profil/:id` | Supprimer un fait |
| GET | `/api/actions` | Actions en attente de validation |
| POST | `/api/actions/:id` | `{ approve }` : approuver ou refuser une action |
| POST | `/api/jobs/briefing-du-matin` | Génère le briefing (à appeler par un cron à 7 h) |

## Déployer

L'assistant est un serveur Node.js qui tourne en continu et garde sa mémoire sur disque : il ne se publie pas
sur Netlify (sites statiques et fonctions courtes). Le site champly.fr peut rester sur Netlify, et l'assistant
tourner à côté sur un sous-domaine, par exemple `api.champly.fr`.

**Sur Render (recommandé pour démarrer)**

1. Sur render.com : New > Blueprint, choisir ce dépôt. Render lit `render.yaml`.
2. Saisir `ANTHROPIC_API_KEY` quand Render la demande. `ASSISTANT_TOKEN` est généré automatiquement
   (visible dans l'onglet Environment du service).
3. Une fois le service en ligne, vérifier `https://<nom>.onrender.com/health`.
4. Dans Render : Settings > Custom Domains > ajouter `api.champly.fr`. Chez le gestionnaire DNS de champly.fr
   (Netlify DNS si le domaine y est), ajouter l'enregistrement CNAME `api` → `<nom>.onrender.com`.

**Sur un VPS**

`docker compose up -d` lance l'assistant sur le port 3000 en local du serveur ; un reverse proxy HTTPS
(Caddy recommandé) le publie sur le sous-domaine choisi de champly.fr.

## Prochaines étapes

1. Choisir l'hébergeur et le canal mobile (Telegram recommandé), puis ajouter le canal dans `src/server.ts`.
2. Brancher Gmail et Google Agenda comme outils du secrétaire (lecture + brouillons, envoi après validation).
3. Exécuter les actions approuvées depuis `POST /api/actions/:id`.
4. Remplacer le stockage JSON par PostgreSQL + pgvector (`db/schema.sql`) et la recherche sémantique.
5. Boucle d'apprentissage nocturne : relire la journée, mettre à jour profil et projets.
6. Interface web (PWA) avec la page « Ce que je sais de toi ».

## Notes techniques

- Modèles et effort se règlent dans `.env` (`MODEL_MAIN`, `MODEL_FAST`, `EFFORT_MAIN`).
- Le prompt système stable est mis en cache ; le contexte variable (date, profil, projets) est placé après.
- Sur Claude Opus 5.5, le repli serveur en cas de refus de sécurité est activé (`fallbacks: "default"`).
- L'historique de conversation est conservé en texte seulement (les blocs de raisonnement ne sont pas rejoués).

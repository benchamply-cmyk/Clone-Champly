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

La réponse arrive en deux temps : `POST /api/chat` renvoie un `jobId`, puis `GET /api/chat/:jobId` donne la
réponse quand elle est prête. Réutiliser le `conversationId` renvoyé pour continuer la même conversation.

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/health` | Sans jeton : variables présentes ? `?jeton=…` dit si un jeton est le bon |
| POST | `/api/chat` | `{ message, conversationId? }` → `{ jobId, conversationId }` |
| GET | `/api/chat/:jobId` | État de la tâche, et la réponse quand elle est prête |
| GET | `/api/memoire` | Ce que l'assistant sait de Ben : profil, projets, savoir-faire |
| POST | `/api/memoire/:id/verrou` | `{ locked }` : verrouiller ou déverrouiller un fait |
| DELETE | `/api/memoire/:id` | Supprimer un fait |
| GET | `/api/actions` | Actions en attente de validation |
| POST | `/api/actions/:id` | `{ approve }` : approuver ou refuser une action |
| POST | `/api/jobs/briefing-du-matin` | Lance le briefing (il part aussi tout seul chaque jour à 7 h, heure de Paris) |

## Mise en ligne : Netlify + Render

- **Netlify** sert la page `public/index.html` sur champly.fr (offre gratuite) et relaie `/api/*` vers Render
  (`netlify.toml`).
- **Render** fait tourner le serveur `src/server.ts` sans limite de durée (`render.yaml`, plan Starter),
  avec la mémoire dans un fichier sur un disque Render de 1 Go (`/var/data`).

1. Render : New > Blueprint > dépôt **Clone-Champly** > Apply. Renseigner `ANTHROPIC_API_KEY`
   (console.anthropic.com > API Keys) et `ASSISTANT_TOKEN` (le mot de passe de l'assistant).
2. Vérifier que l'adresse du service est `https://champly-assistant.onrender.com`. Sinon, la reporter
   dans `netlify.toml`.
3. Netlify : rien à régler, à part supprimer les anciennes variables (elles ne servent plus).
4. Tester `https://champly.fr/api/health?jeton=…`, puis écrire à l'assistant sur champly.fr.

`docker compose up -d` lance le même serveur sur n'importe quelle machine.

## Prochaines étapes

1. Choisir le canal mobile (Telegram recommandé) et l'ajouter comme nouvelle route de l'API.
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

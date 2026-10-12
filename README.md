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

Réutiliser le `conversationId` renvoyé pour continuer la même conversation. (Sur Netlify, la réponse arrive
en deux temps : voir « Déployer sur Netlify ».)

## API

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/health` | Vérifie que le service tourne, sans jeton (Netlify : `/api/health`) |
| POST | `/api/chat` | `{ message, conversationId? }` → `{ conversationId, answer }` (Netlify : `{ jobId, conversationId }`) |
| GET | `/api/chat/:jobId` | Netlify seulement : état de la tâche et réponse quand elle est prête |
| GET | `/api/memoire` | Ce que l'assistant sait de Ben : profil, projets, savoir-faire |
| POST | `/api/memoire/profil/:id/verrou` | `{ locked }` : verrouiller ou déverrouiller un fait |
| DELETE | `/api/memoire/profil/:id` | Supprimer un fait |
| GET | `/api/actions` | Actions en attente de validation |
| POST | `/api/actions/:id` | `{ approve }` : approuver ou refuser une action |
| POST | `/api/jobs/briefing-du-matin` | Génère le briefing (à appeler par un cron à 7 h) |

## Déployer sur Netlify

Tout tourne sur Netlify : la page de discussion (`public/index.html`), l'API en fonctions Netlify
(`netlify/functions/`) et la mémoire dans Netlify Blobs. Aucun serveur à gérer.

1. Sur app.netlify.com : Add new project > Import an existing project > GitHub > **Clone-Champly**.
   Netlify lit `netlify.toml` : rien à remplir dans les réglages de build.
2. Avant le premier déploiement, dans Project configuration > Environment variables, ajouter :
   - `ANTHROPIC_API_KEY` : ta clé API Claude (console.anthropic.com > API Keys) ;
   - `ASSISTANT_TOKEN` : un mot de passe long et aléatoire, c'est lui qui protège l'assistant.
3. Déployer, puis ouvrir l'adresse `.netlify.app` du projet, coller le jeton et écrire à l'assistant.
4. Domaine : Domain management > Add a domain. Si champly.fr sert déjà un autre site Netlify,
   utiliser un sous-domaine comme `app.champly.fr` pour ne pas le remplacer.

**Comment ça tient dans les limites de Netlify.** Une fonction Netlify s'arrête au bout de 30 s, et une réponse
de l'assistant peut prendre plusieurs minutes. `POST /api/chat` confie donc le travail à la fonction d'arrière-plan
`assistant-background` (jusqu'à 15 minutes) et renvoie un `jobId` ; la page interroge `GET /api/chat/:jobId`
jusqu'à la réponse. Le briefing du matin part chaque jour à 5 h UTC (7 h à Paris en été) via `briefing-planifie`.

**Limite connue.** La mémoire est un seul document dans Netlify Blobs : une réponse longue qui se termine
peut écraser une modification faite pendant qu'elle tournait (par exemple une action validée au même moment).
Sans gravité pour un seul utilisateur ; le passage à PostgreSQL la supprimera.

### Ailleurs (serveur Node, VPS)

`npm run build && npm start`, ou `docker compose up -d`, lance la même API avec Fastify (`src/server.ts`)
et la mémoire dans un fichier sur disque.

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

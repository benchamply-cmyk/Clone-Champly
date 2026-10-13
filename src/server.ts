import { randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { chat } from "./agents/chief.js";
import { config } from "./config.js";
import { morningBrief } from "./jobs/morning-brief.js";
import { fileBackend } from "./memory/file-backend.js";
import { JsonMemoryStore } from "./memory/store.js";

/**
 * Passerelle HTTP de l'assistant (Render, VPS ou local). Mêmes routes que les fonctions Netlify,
 * pour que la page de champly.fr marche à l'identique : POST /api/chat lance le travail et renvoie
 * un jobId, puis GET /api/chat/:jobId donne la réponse. Aucune limite de durée ici.
 */
const memory = await new JsonMemoryStore(fileBackend(config.dataDir)).load();
const app = Fastify({ logger: true });

interface Job {
  id: string;
  conversationId: string;
  status: "en cours" | "terminé" | "erreur";
  answer?: string;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}
// Les tâches ne vivent que le temps d'être lues : un redémarrage ne perd que celles en cours.
const jobs = new Map<string, Job>();

function startJob(conversationId: string, work: () => Promise<string>): Job {
  const job: Job = { id: randomUUID(), conversationId, status: "en cours", createdAt: new Date().toISOString() };
  jobs.set(job.id, job);
  work()
    .then((answer) => Object.assign(job, { status: "terminé", answer }))
    .catch((err: unknown) => {
      app.log.error(err);
      Object.assign(job, { status: "erreur", error: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
      setTimeout(() => jobs.delete(job.id), 60 * 60 * 1000).unref();
    });
  return job;
}

// Retire espaces, retours à la ligne et guillemets collés par erreur autour du jeton.
const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();
const expectedToken = Buffer.from(clean(config.assistantToken));

function tokenMatches(token: string): boolean {
  const given = Buffer.from(clean(token.replace(/^Bearer\s+/i, "")));
  return given.length === expectedToken.length && timingSafeEqual(given, expectedToken);
}

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health" || req.url.startsWith("/api/health")) return;
  if (!tokenMatches(req.headers.authorization ?? "")) return reply.code(401).send({ error: "non autorisé" });
});

app.get("/health", async () => ({ ok: true }));

// Diagnostic sans jeton : dit si les variables sont présentes, jamais leur valeur.
app.get<{ Querystring: { jeton?: string } }>("/api/health", async (req) => ({
  ok: true,
  cleApiClaude: Boolean(process.env.ANTHROPIC_API_KEY),
  jetonAssistant: expectedToken.length > 0,
  ...(req.query.jeton !== undefined && {
    jetonEssaye: tokenMatches(req.query.jeton) ? "correct" : "différent de ASSISTANT_TOKEN",
  }),
}));

app.post<{ Body: { message: string; conversationId?: string } }>("/api/chat", {
  schema: {
    body: {
      type: "object",
      required: ["message"],
      properties: { message: { type: "string", minLength: 1 }, conversationId: { type: "string" } },
    },
  },
  handler: async (req, reply) => {
    const conversationId = req.body.conversationId ?? randomUUID();
    const { message } = req.body;
    const job = startJob(conversationId, () => chat(memory, { conversationId, channel: "web", message }));
    return reply.code(202).send({ jobId: job.id, conversationId });
  },
});

app.get<{ Params: { id: string } }>("/api/chat/:id", async (req, reply) => {
  const job = jobs.get(req.params.id);
  return job ?? reply.code(404).send({ error: "tâche introuvable" });
});

// « Ce que je sais de toi » : Ben consulte, verrouille ou supprime ce que l'agent a retenu.
app.get("/api/memoire", async () => ({
  profil: await memory.getProfile(),
  projets: await memory.listProjects(),
  savoirFaire: await memory.listSkills(),
}));
app.post<{ Params: { id: string }; Body: { locked: boolean } }>("/api/memoire/:id/verrou", async (req) => {
  await memory.setFactLocked(req.params.id, Boolean(req.body.locked));
  return { ok: true };
});
app.delete<{ Params: { id: string } }>("/api/memoire/:id", async (req) => {
  await memory.deleteFact(req.params.id);
  return { ok: true };
});

// File de validation des actions externes.
app.get("/api/actions", async () => memory.listPendingActions());
app.post<{ Params: { id: string }; Body: { approve: boolean } }>("/api/actions/:id", async (req, reply) => {
  const action = await memory.decideAction(req.params.id, Boolean(req.body.approve));
  if (!action) return reply.code(404).send({ error: "action introuvable ou déjà traitée" });
  // TODO : exécuter l'action approuvée via l'intégration correspondante (Gmail, GitHub, site…).
  return action;
});

const startBriefing = () => {
  const day = new Date().toISOString().slice(0, 10);
  return startJob(`briefing-${day}`, () => morningBrief(memory));
};
app.post("/api/jobs/briefing-du-matin", async (_req, reply) => reply.code(202).send({ jobId: startBriefing().id }));

// Briefing du matin à 7 h, heure de Ben (été comme hiver).
let lastBriefing = "";
setInterval(() => {
  const now = new Intl.DateTimeFormat("fr-FR", {
    timeZone: config.timezone, hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [date, time] = now.split(" ");
  if (time === "07:00" && date !== lastBriefing) {
    lastBriefing = date;
    startBriefing();
  }
}, 30 * 1000).unref();

await app.listen({ port: config.port, host: "0.0.0.0" });

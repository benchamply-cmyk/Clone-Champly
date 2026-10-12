import { randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import { chat } from "./agents/chief.js";
import { config } from "./config.js";
import { morningBrief } from "./jobs/morning-brief.js";
import { fileBackend } from "./memory/file-backend.js";
import { JsonMemoryStore } from "./memory/store.js";

/**
 * Passerelle HTTP de l'assistant. Canal web pour commencer ; Telegram et le mail
 * se brancheront sur le même point d'entrée chat() quand le canal mobile sera choisi.
 */
const memory = await new JsonMemoryStore(fileBackend(config.dataDir)).load();
const app = Fastify({ logger: true });

function authorized(header: string | undefined): boolean {
  const expected = Buffer.from(`Bearer ${config.assistantToken}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;
  if (!authorized(req.headers.authorization)) return reply.code(401).send({ error: "non autorisé" });
});

app.get("/health", async () => ({ ok: true }));

app.post<{ Body: { message: string; conversationId?: string } }>("/api/chat", {
  schema: {
    body: {
      type: "object",
      required: ["message"],
      properties: { message: { type: "string", minLength: 1 }, conversationId: { type: "string" } },
    },
  },
  handler: async (req) => {
    const conversationId = req.body.conversationId ?? randomUUID();
    const answer = await chat(memory, { conversationId, channel: "web", message: req.body.message });
    return { conversationId, answer };
  },
});

// « Ce que je sais de toi » : Ben consulte, verrouille ou supprime ce que l'agent a retenu.
app.get("/api/memoire", async () => ({
  profil: await memory.getProfile(),
  projets: await memory.listProjects(),
  savoirFaire: await memory.listSkills(),
}));
app.post<{ Params: { id: string }; Body: { locked: boolean } }>("/api/memoire/profil/:id/verrou", async (req) => {
  await memory.setFactLocked(req.params.id, req.body.locked);
  return { ok: true };
});
app.delete<{ Params: { id: string } }>("/api/memoire/profil/:id", async (req) => {
  await memory.deleteFact(req.params.id);
  return { ok: true };
});

// File de validation des actions externes.
app.get("/api/actions", async () => memory.listPendingActions());
app.post<{ Params: { id: string }; Body: { approve: boolean } }>("/api/actions/:id", async (req, reply) => {
  const action = await memory.decideAction(req.params.id, req.body.approve);
  if (!action) return reply.code(404).send({ error: "action introuvable ou déjà traitée" });
  // TODO : exécuter l'action approuvée via l'intégration correspondante (Gmail, GitHub, site…).
  return action;
});

app.post("/api/jobs/briefing-du-matin", async () => ({ briefing: await morningBrief(memory) }));

await app.listen({ port: config.port, host: "0.0.0.0" });

import { randomUUID } from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import { authorized, jobs, json, loadMemory, startJob, type Job } from "../lib/shared.js";

/**
 * API de l'assistant sur Netlify (mêmes routes que src/server.ts).
 * Une discussion se fait en deux temps, pour ne pas dépasser la limite de 30 s des fonctions :
 * POST /api/chat lance le travail et renvoie un jobId, puis GET /api/chat/:jobId donne la réponse.
 */
export default async (req: Request, context: Context) => {
  try {
    return await handle(req, context);
  } catch (err) {
    // Toujours renvoyer la vraie cause à la page, plutôt qu'une erreur 500 muette.
    console.error(err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

async function handle(req: Request, context: Context): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const route = `${req.method} /${parts[0] ?? ""}`;

  // Diagnostic sans jeton : dit si les variables sont présentes, jamais leur valeur.
  if (route === "GET /health")
    return json({
      ok: true,
      cleApiClaude: Boolean(process.env.ANTHROPIC_API_KEY),
      jetonAssistant: Boolean(process.env.ASSISTANT_TOKEN),
    });
  if (!authorized(req)) return json({ error: "non autorisé" }, 401);

  switch (route) {
    case "POST /chat": {
      const body = (await req.json().catch(() => ({}))) as { message?: string; conversationId?: string };
      if (!body.message?.trim()) return json({ error: "message manquant" }, 400);
      const job: Job = {
        id: randomUUID(),
        kind: "chat",
        conversationId: body.conversationId ?? randomUUID(),
        message: body.message,
        status: "en cours",
        createdAt: new Date().toISOString(),
      };
      await startJob(context.site.url ?? url.origin, job);
      return json({ jobId: job.id, conversationId: job.conversationId }, 202);
    }

    case "GET /chat": {
      const job = parts[1] ? await jobs().get(parts[1], { type: "json" }) : null;
      return job ? json(job) : json({ error: "tâche introuvable" }, 404);
    }

    case "GET /memoire": {
      const memory = await loadMemory();
      return json({
        profil: await memory.getProfile(),
        projets: await memory.listProjects(),
        savoirFaire: await memory.listSkills(),
      });
    }

    // POST /api/memoire/:id/verrou  { locked }   ·   DELETE /api/memoire/:id
    case "POST /memoire": {
      if (!parts[1] || parts[2] !== "verrou") break;
      const { locked } = (await req.json()) as { locked: boolean };
      await (await loadMemory()).setFactLocked(parts[1], Boolean(locked));
      return json({ ok: true });
    }
    case "DELETE /memoire": {
      if (!parts[1]) break;
      await (await loadMemory()).deleteFact(parts[1]);
      return json({ ok: true });
    }

    case "GET /actions":
      return json(await (await loadMemory()).listPendingActions());

    case "POST /actions": {
      if (!parts[1]) break;
      const { approve } = (await req.json()) as { approve: boolean };
      const action = await (await loadMemory()).decideAction(parts[1], Boolean(approve));
      // TODO : exécuter l'action approuvée via l'intégration correspondante (Gmail, GitHub, site…).
      return action ? json(action) : json({ error: "action introuvable ou déjà traitée" }, 404);
    }

    case "POST /jobs": {
      if (parts[1] !== "briefing-du-matin") break;
      const day = new Date().toISOString().slice(0, 10);
      const job: Job = {
        id: randomUUID(),
        kind: "briefing",
        conversationId: `briefing-${day}`,
        status: "en cours",
        createdAt: new Date().toISOString(),
      };
      await startJob(context.site.url ?? url.origin, job);
      return json({ jobId: job.id }, 202);
    }
  }
  return json({ error: "route inconnue" }, 404);
}

export const config: Config = { path: "/api/*" };

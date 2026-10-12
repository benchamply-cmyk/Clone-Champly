import { chat } from "../../src/agents/chief.js";
import { morningBrief } from "../../src/jobs/morning-brief.js";
import { authorized, jobs, loadMemory, type Job } from "../lib/shared.js";

/**
 * Fonction d'arrière-plan (suffixe -background) : Netlify lui laisse jusqu'à 15 minutes,
 * le temps pour le chef de cabinet de réfléchir et de déléguer aux agents spécialisés.
 * Le résultat est rangé dans Netlify Blobs, où la page le récupère.
 */
export default async (req: Request) => {
  if (!authorized(req)) return;
  const { jobId } = (await req.json()) as { jobId: string };
  const store = jobs();
  const job = (await store.get(jobId, { type: "json" })) as Job | null;
  if (!job || job.status !== "en cours") return;

  try {
    const memory = await loadMemory();
    job.answer =
      job.kind === "briefing"
        ? await morningBrief(memory)
        : await chat(memory, { conversationId: job.conversationId, channel: "web", message: job.message ?? "" });
    job.status = "terminé";
  } catch (err) {
    job.status = "erreur";
    job.error = err instanceof Error ? err.message : String(err);
    console.error(err);
  }
  job.finishedAt = new Date().toISOString();
  await store.setJSON(job.id, job);
};

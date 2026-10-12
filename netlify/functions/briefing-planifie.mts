import { randomUUID } from "node:crypto";
import type { Config } from "@netlify/functions";
import { startJob, type Job } from "../lib/shared.js";

/**
 * Briefing du matin, chaque jour à 7 h (heure de Paris en été ; 6 h en hiver, l'horaire Netlify étant en UTC).
 * Une fonction planifiée n'a que 30 s : elle confie donc le travail à la fonction d'arrière-plan.
 * Le briefing est rangé dans la conversation « briefing-AAAA-MM-JJ ».
 */
export default async () => {
  const siteUrl = process.env.URL;
  if (!siteUrl) throw new Error("URL du site inconnue");
  const day = new Date().toISOString().slice(0, 10);
  const job: Job = {
    id: randomUUID(),
    kind: "briefing",
    conversationId: `briefing-${day}`,
    status: "en cours",
    createdAt: new Date().toISOString(),
  };
  await startJob(siteUrl, job);
};

export const config: Config = { schedule: "0 5 * * *" };

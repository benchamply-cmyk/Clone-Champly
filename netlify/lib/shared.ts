import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { blobsBackend } from "../../src/memory/blobs-backend.js";
import { JsonMemoryStore } from "../../src/memory/store.js";

/** Une tâche confiée à la fonction d'arrière-plan (jusqu'à 15 minutes de travail). */
export interface Job {
  id: string;
  kind: "chat" | "briefing";
  conversationId: string;
  message?: string;
  status: "en cours" | "terminé" | "erreur";
  answer?: string;
  error?: string;
  createdAt: string;
  finishedAt?: string;
}

export const jobs = () => getStore({ name: "taches", consistency: "strong" });

export const loadMemory = () => new JsonMemoryStore(blobsBackend()).load();

// Retire espaces, retours à la ligne et guillemets collés par erreur autour du jeton.
const clean = (value: string) => value.trim().replace(/^["']|["']$/g, "").trim();

export function authorized(req: Request): boolean {
  const token = clean(process.env.ASSISTANT_TOKEN ?? "");
  if (!token) return false;
  const expected = Buffer.from(token);
  const given = Buffer.from(clean((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

/** Lance la fonction d'arrière-plan : Netlify répond 202 tout de suite et le travail continue. */
export async function startJob(siteUrl: string, job: Job): Promise<void> {
  await jobs().setJSON(job.id, job);
  const res = await fetch(new URL("/.netlify/functions/assistant-background", siteUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${clean(process.env.ASSISTANT_TOKEN ?? "")}`, "content-type": "application/json" },
    body: JSON.stringify({ jobId: job.id }),
  });
  if (res.status !== 202) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(
      `Lancement de la tâche refusé (HTTP ${res.status}). Vérifie que la fonction « assistant-background » ` +
        `apparaît dans Netlify (Deploys > Functions) et que ton offre inclut les fonctions d'arrière-plan. ${detail}`,
    );
  }
}

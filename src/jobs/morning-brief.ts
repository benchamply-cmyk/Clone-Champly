import { chat } from "../agents/chief.js";
import type { MemoryStore } from "../memory/store.js";

/**
 * Briefing du matin (MVP). Lancé chaque jour à 7 h (heure de Ben) par le serveur lui-même,
 * ou à la demande via POST /api/jobs/briefing-du-matin ou `npm run brief`.
 *
 * Une fois Gmail et Google Agenda branchés, le secrétaire y ajoutera l'agenda
 * du jour et les mails importants.
 */
export function morningBrief(memory: MemoryStore): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  return chat(memory, {
    conversationId: `briefing-${day}`,
    channel: "cron",
    message:
      "Prépare mon briefing du matin : l'état de chacun de mes projets, les actions en attente de ma validation, " +
      "et les 3 priorités que tu me proposes pour aujourd'hui, avec pour chacune le prochain pas concret.",
  });
}

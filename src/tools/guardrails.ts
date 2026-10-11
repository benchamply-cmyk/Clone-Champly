import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MemoryStore } from "../memory/store.js";

/**
 * Trois niveaux d'action :
 * - libre : lire, chercher, rédiger (l'agent le fait seul)
 * - validation : envoyer, publier, fusionner, inviter (mis en file d'attente pour Ben)
 * - interdit : payer, supprimer en masse (refusé)
 */
export const ACTION_LEVELS = {
  envoyer_mail: "validation",
  inviter_agenda: "validation",
  publier_article: "validation",
  fusionner_pull_request: "validation",
  payer: "interdit",
  supprimer_en_masse: "interdit",
} as const;

export type ActionKind = keyof typeof ACTION_LEVELS;

export function guardrailTools(memory: MemoryStore) {
  const proposeAction = betaZodTool({
    name: "proposer_action",
    description:
      "Propose à Ben une action ayant un effet hors de l'assistant (envoyer un mail, publier, fusionner, inviter). " +
      "L'action n'est PAS exécutée : elle part dans la file de validation et Ben l'approuve ou la refuse.",
    inputSchema: z.object({
      kind: z.enum(Object.keys(ACTION_LEVELS) as [ActionKind, ...ActionKind[]]),
      summary: z.string().describe("Ce que fera l'action, en une phrase lisible par Ben"),
      payload: z.record(z.string(), z.unknown()).describe("Détails nécessaires pour exécuter l'action"),
    }),
    run: async ({ kind, summary, payload }) => {
      if (ACTION_LEVELS[kind] === "interdit") {
        return `Refusé : l'action « ${kind} » est interdite à l'assistant.`;
      }
      const pending = await memory.addPendingAction({ kind, summary, payload });
      return `Action mise en attente de validation par Ben (id ${pending.id}).`;
    },
  });

  return [proposeAction];
}

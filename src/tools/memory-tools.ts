import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MemoryStore } from "../memory/store.js";

/** Outils qui permettent à l'assistant de lire et d'enrichir sa mémoire de Ben. */
export function memoryTools(memory: MemoryStore) {
  const rememberFact = betaZodTool({
    name: "retenir_sur_ben",
    description:
      "Enregistre un fait durable sur Ben dans son profil (objectif, préférence, style, contact clé, horaire). " +
      "N'enregistre jamais d'information de santé ou de finances sans son accord explicite dans la conversation.",
    inputSchema: z.object({
      topic: z.string().describe("Sujet court, ex. « objectifs », « style d'écriture », « horaires »"),
      fact: z.string().describe("Le fait, formulé en une phrase"),
    }),
    run: async ({ topic, fact }) => JSON.stringify(await memory.rememberFact(topic, fact)),
  });

  const upsertProject = betaZodTool({
    name: "mettre_a_jour_projet",
    description:
      "Crée ou met à jour la fiche d'un projet de Ben (but, état, prochain pas, décisions). " +
      "À appeler dès qu'une idée devient un projet ou qu'une tâche fait avancer un projet.",
    inputSchema: z.object({
      name: z.string(),
      goal: z.string().optional(),
      status: z.enum(["idée", "en cours", "en pause", "terminé"]).optional(),
      nextStep: z.string().optional(),
      decisions: z.array(z.string()).optional().describe("Liste complète des décisions prises"),
    }),
    run: async (input) => JSON.stringify(await memory.upsertProject(input)),
  });

  const searchJournal = betaZodTool({
    name: "chercher_dans_le_journal",
    description: "Cherche dans le journal des échanges passés avec Ben (mots-clés).",
    inputSchema: z.object({ query: z.string(), limit: z.number().int().min(1).max(50).optional() }),
    run: async ({ query, limit }) => {
      const hits = await memory.searchEpisodes(query, limit ?? 10);
      return hits.length ? hits.map((e) => `[${e.at}] ${e.role}: ${e.text}`).join("\n") : "Aucun résultat.";
    },
  });

  const saveSkill = betaZodTool({
    name: "enregistrer_savoir_faire",
    description: "Enregistre une procédure qui a fonctionné, pour la réutiliser plus tard.",
    inputSchema: z.object({ title: z.string(), steps: z.string() }),
    run: async ({ title, steps }) => JSON.stringify(await memory.saveSkill(title, steps)),
  });

  return [rememberFact, upsertProject, searchJournal, saveSkill];
}

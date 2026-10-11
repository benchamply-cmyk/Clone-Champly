import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { BetaToolRunnerParams } from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";

// Lit ANTHROPIC_API_KEY dans l'environnement.
export const anthropic = new Anthropic();

type Tools = BetaToolRunnerParams["tools"];

export interface RunOptions {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Partie stable du prompt système (mise en cache). */
  system: string;
  /** Partie qui change (profil, projets, date) : placée après le point de cache. */
  context?: string;
  messages: BetaMessageParam[];
  tools: Tools;
  maxIterations?: number;
}

// Repli côté serveur en cas de refus des classifieurs de sécurité :
// disponible sur Claude Opus 5.5 avec l'API Claude, pas sur Haiku.
const SUPPORTS_FALLBACK = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

/**
 * Lance un agent : le tool runner du SDK enchaîne appels au modèle et exécution des outils
 * jusqu'à la réponse finale. La pensée adaptative est active par défaut sur ces modèles.
 */
export async function runAgent(opts: RunOptions): Promise<string> {
  const system: BetaTextBlockParam[] = [
    { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
  ];
  if (opts.context) system.push({ type: "text", text: opts.context });

  const fallback = SUPPORTS_FALLBACK.has(opts.model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};

  const final = await anthropic.beta.messages.toolRunner({
    model: opts.model,
    max_tokens: 16000,
    output_config: { effort: opts.effort },
    system,
    messages: opts.messages,
    tools: opts.tools,
    max_iterations: opts.maxIterations ?? 20,
    ...fallback,
  });

  if (final.stop_reason === "refusal") {
    const category = final.stop_details?.category ?? "non précisée";
    return `Je ne peux pas traiter cette demande (refus de sécurité, catégorie : ${category}).`;
  }

  const text = final.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
  if (final.stop_reason === "max_tokens") return `${text}\n\n(Réponse tronquée : limite de longueur atteinte.)`;
  return text || "(pas de réponse texte)";
}

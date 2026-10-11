function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const config = {
  port: Number(env("PORT", "3000")),
  dataDir: env("DATA_DIR", "./data"),
  assistantToken: env("ASSISTANT_TOKEN"),
  modelMain: env("MODEL_MAIN", "claude-opus-5-5"),
  modelFast: env("MODEL_FAST", "claude-haiku-5-5"),
  effortMain: env("EFFORT_MAIN", "high") as Effort,
  ownerName: env("OWNER_NAME", "Ben"),
  timezone: env("TZ_OWNER", "Europe/Paris"),
};

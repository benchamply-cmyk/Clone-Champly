import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Les quatre mémoires de l'assistant (voir le document d'architecture) :
 * - profil : qui est Ben (objectifs, style, préférences), validé par lui chaque semaine
 * - projets : un dossier vivant par projet
 * - épisodes : le journal horodaté de ce qui s'est dit et fait
 * - savoir-faire : les procédures qui ont marché
 *
 * Ce premier stockage est un fichier JSON pour démarrer sans base de données.
 * L'interface MemoryStore permet de brancher PostgreSQL + pgvector (db/schema.sql)
 * sans toucher au reste du code.
 */

export interface ProfileFact {
  id: string;
  topic: string; // ex. "objectifs", "style d'écriture", "horaires"
  fact: string;
  locked: boolean; // verrouillé par Ben : l'agent ne peut plus le modifier
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  status: "idée" | "en cours" | "en pause" | "terminé";
  nextStep: string;
  decisions: string[];
  autonomy: "proposer" | "agir sur branche" | "autonome"; // niveau fixé par Ben
  monthlyBudgetEur: number;
  updatedAt: string;
}

export interface Episode {
  id: string;
  at: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  channel: string; // "web", "telegram", "mail", "cron"
  text: string;
}

export interface Skill {
  id: string;
  title: string;
  steps: string;
  updatedAt: string;
}

export interface PendingAction {
  id: string;
  at: string;
  kind: string; // ex. "envoyer_mail", "publier_article"
  summary: string;
  payload: Record<string, unknown>;
  status: "en attente" | "approuvée" | "refusée";
}

interface MemoryData {
  profile: ProfileFact[];
  projects: Project[];
  episodes: Episode[];
  skills: Skill[];
  pendingActions: PendingAction[];
}

export interface MemoryStore {
  getProfile(): Promise<ProfileFact[]>;
  rememberFact(topic: string, fact: string): Promise<ProfileFact | { refused: string }>;
  setFactLocked(id: string, locked: boolean): Promise<void>;
  deleteFact(id: string): Promise<void>;

  listProjects(): Promise<Project[]>;
  upsertProject(input: Partial<Project> & { name: string }): Promise<Project>;

  appendEpisode(e: Omit<Episode, "id" | "at">): Promise<void>;
  conversation(conversationId: string, limit: number): Promise<Episode[]>;
  searchEpisodes(query: string, limit: number): Promise<Episode[]>;

  listSkills(): Promise<Skill[]>;
  saveSkill(title: string, steps: string): Promise<Skill>;

  addPendingAction(a: Omit<PendingAction, "id" | "at" | "status">): Promise<PendingAction>;
  listPendingActions(): Promise<PendingAction[]>;
  decideAction(id: string, approved: boolean): Promise<PendingAction | undefined>;
}

const now = () => new Date().toISOString();

export class JsonMemoryStore implements MemoryStore {
  private data: MemoryData = { profile: [], projects: [], episodes: [], skills: [], pendingActions: [] };
  private readonly file: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "memory.json");
  }

  async load(): Promise<this> {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.data = { ...this.data, ...JSON.parse(await readFile(this.file, "utf8")) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return this;
  }

  // Écritures sérialisées et atomiques (fichier temporaire puis renommage).
  private save(): Promise<void> {
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(this.data, null, 2));
      await rename(tmp, this.file);
    });
    return this.writing;
  }

  async getProfile() {
    return this.data.profile;
  }

  async rememberFact(topic: string, fact: string) {
    const existing = this.data.profile.find((f) => f.topic === topic && f.fact === fact);
    if (existing) return existing;
    const locked = this.data.profile.find((f) => f.topic === topic && f.locked);
    if (locked) return { refused: `Le sujet « ${topic} » est verrouillé : demande d’abord l’accord du propriétaire.` };
    const item: ProfileFact = { id: randomUUID(), topic, fact, locked: false, updatedAt: now() };
    this.data.profile.push(item);
    await this.save();
    return item;
  }

  async setFactLocked(id: string, locked: boolean) {
    const f = this.data.profile.find((x) => x.id === id);
    if (f) {
      f.locked = locked;
      f.updatedAt = now();
      await this.save();
    }
  }

  async deleteFact(id: string) {
    this.data.profile = this.data.profile.filter((f) => f.id !== id);
    await this.save();
  }

  async listProjects() {
    return this.data.projects;
  }

  async upsertProject(input: Partial<Project> & { name: string }) {
    let p = this.data.projects.find((x) => x.name.toLowerCase() === input.name.toLowerCase());
    if (!p) {
      p = {
        id: randomUUID(),
        name: input.name,
        goal: "",
        status: "idée",
        nextStep: "",
        decisions: [],
        autonomy: "proposer",
        monthlyBudgetEur: 0,
        updatedAt: now(),
      };
      this.data.projects.push(p);
    }
    // L'autonomie et le budget restent fixés par Ben : l'agent ne peut pas se les attribuer.
    const { autonomy: _a, monthlyBudgetEur: _b, id: _i, ...editable } = input;
    Object.assign(p, editable, { updatedAt: now() });
    await this.save();
    return p;
  }

  async appendEpisode(e: Omit<Episode, "id" | "at">) {
    this.data.episodes.push({ id: randomUUID(), at: now(), ...e });
    await this.save();
  }

  async conversation(conversationId: string, limit: number) {
    return this.data.episodes.filter((e) => e.conversationId === conversationId).slice(-limit);
  }

  // Recherche plein texte naïve ; remplacée par une recherche sémantique (pgvector) plus tard.
  async searchEpisodes(query: string, limit: number) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.data.episodes
      .filter((e) => words.every((w) => e.text.toLowerCase().includes(w)))
      .slice(-limit);
  }

  async listSkills() {
    return this.data.skills;
  }

  async saveSkill(title: string, steps: string) {
    let s = this.data.skills.find((x) => x.title === title);
    if (s) Object.assign(s, { steps, updatedAt: now() });
    else this.data.skills.push((s = { id: randomUUID(), title, steps, updatedAt: now() }));
    await this.save();
    return s;
  }

  async addPendingAction(a: Omit<PendingAction, "id" | "at" | "status">) {
    const item: PendingAction = { id: randomUUID(), at: now(), status: "en attente", ...a };
    this.data.pendingActions.push(item);
    await this.save();
    return item;
  }

  async listPendingActions() {
    return this.data.pendingActions.filter((a) => a.status === "en attente");
  }

  async decideAction(id: string, approved: boolean) {
    const a = this.data.pendingActions.find((x) => x.id === id);
    if (!a || a.status !== "en attente") return undefined;
    a.status = approved ? "approuvée" : "refusée";
    await this.save();
    return a;
  }
}

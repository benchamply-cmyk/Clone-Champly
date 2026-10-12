import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryBackend } from "./store.js";

/** Mémoire dans un fichier sur disque (serveur Node, VPS, Docker). */
export function fileBackend(dataDir: string): MemoryBackend {
  const file = path.join(dataDir, "memory.json");
  return {
    async read() {
      try {
        return await readFile(file, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    // Écriture atomique : fichier temporaire puis renommage.
    async write(json) {
      await mkdir(dataDir, { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, json);
      await rename(tmp, file);
    },
  };
}

import { getStore } from "@netlify/blobs";
import type { MemoryBackend } from "./store.js";

/** Mémoire dans Netlify Blobs : permanente, sans disque, disponible dans toutes les fonctions du site. */
export function blobsBackend(): MemoryBackend {
  const store = getStore({ name: "memoire", consistency: "strong" });
  return {
    read: () => store.get("memory.json", { type: "text" }),
    write: async (json) => {
      await store.set("memory.json", json);
    },
  };
}

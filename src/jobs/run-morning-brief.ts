import { config } from "../config.js";
import { fileBackend } from "../memory/file-backend.js";
import { JsonMemoryStore } from "../memory/store.js";
import { morningBrief } from "./morning-brief.js";

const memory = await new JsonMemoryStore(fileBackend(config.dataDir)).load();
console.log(await morningBrief(memory));

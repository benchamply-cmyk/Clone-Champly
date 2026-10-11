import { config } from "../config.js";
import { JsonMemoryStore } from "../memory/store.js";
import { morningBrief } from "./morning-brief.js";

const memory = await new JsonMemoryStore(config.dataDir).load();
console.log(await morningBrief(memory));

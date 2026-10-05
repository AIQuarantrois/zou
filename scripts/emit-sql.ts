import { MIGRATIONS } from "../lib/schema.ts";
for (const m of MIGRATIONS) for (const s of m.statements) console.log(s.trim() + ";\n");

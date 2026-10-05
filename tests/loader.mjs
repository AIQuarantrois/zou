// Chargeur de test : résout l'alias « @/ », les imports sans extension, et remplace le pilote Neon par un double local.
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { dirname, resolve as pres } from "node:path";

const ROOT = pres(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, next) {
  if (specifier === "@neondatabase/serverless") return { url: pathToFileURL(pres(ROOT, "tests/stubs/neon.mjs")).href, shortCircuit: true };
  if (specifier === "@vercel/blob") return { url: pathToFileURL(pres(ROOT, "tests/stubs/blob.mjs")).href, shortCircuit: true };
  let target = null;
  if (specifier.startsWith("@/")) target = pres(ROOT, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) target = pres(dirname(fileURLToPath(context.parentURL)), specifier);
  if (target) {
    for (const cand of [target, target + ".ts", target + "/index.ts"]) {
      if (existsSync(cand) && /\.(ts|mjs|js)$/.test(cand)) return { url: pathToFileURL(cand).href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}

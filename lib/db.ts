import { neon } from "@neondatabase/serverless";
import { env } from "./env";
import { ApiError } from "./http";

export type Row = Record<string, any>;
type Client = ReturnType<typeof neon>;

let client: Client | null = null;

export function hasDb() { return Boolean(env.databaseUrl); }

/** Exécute une requête paramétrée ($1, $2, …). Lève 503 si la base n'est pas branchée. */
export async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  if (!env.databaseUrl) throw new ApiError(503, "db_not_configured", "La base de données n'est pas encore connectée.");
  if (!client) client = neon(env.databaseUrl);
  const rows = await client.query(text, params as any[]);
  return rows as Row[];
}

/** Exécute plusieurs requêtes dans une seule transaction (non interactive) : tout passe, ou rien. */
export async function tx(queries: [string, unknown[]][]): Promise<void> {
  if (!env.databaseUrl) throw new ApiError(503, "db_not_configured", "La base de données n'est pas encore connectée.");
  if (!client) client = neon(env.databaseUrl);
  const c = client;
  await c.transaction((t) => queries.map(([text, params]) => t.query(text, params as any[])));
}

export async function one(text: string, params: unknown[] = []): Promise<Row | null> {
  const rows = await q(text, params);
  return rows[0] ?? null;
}

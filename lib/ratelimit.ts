import { hasDb, one, q } from "./db";
import { ApiError } from "./http";

const mem = new Map<string, { n: number; reset: number }>();

/** Limite le nombre d'appels par clé sur une fenêtre fixe. Partagée entre instances quand la base est branchée. */
export async function limit(key: string, max: number, windowSec: number) {
  let hits: number;
  if (hasDb()) {
    const r = await one(
      `INSERT INTO rate_limits (key, window_start, hits)
       VALUES ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
       ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
       RETURNING hits`,
      [key, windowSec]
    );
    hits = Number(r?.hits ?? 1);
  } else {
    const now = Date.now();
    const cur = mem.get(key);
    if (!cur || cur.reset < now) { mem.set(key, { n: 1, reset: now + windowSec * 1000 }); hits = 1; }
    else { cur.n += 1; hits = cur.n; }
    if (mem.size > 5000) for (const [k, v] of mem) if (v.reset < now) mem.delete(k);
  }
  if (hits > max) throw new ApiError(429, "rate_limited", "Trop de demandes. Réessayez un peu plus tard.");
}

export async function purgeRateLimits() {
  await q(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
}

// Double de test du pilote Neon : exécute les requêtes sur le Postgres local via psql (littéraux échappés).
import { spawnSync } from "node:child_process";

function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "'{" + v.map((x) => '"' + String(x).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",").replace(/'/g, "''") + "}'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function inline(text, params) {
  return text.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1])).trim().replace(/;$/, "");
}

// Requête passée sur l'entrée standard (pas en argument : limite de 128 Ko), en une seule transaction.
function psql(sql) {
  return spawnSync("psql", ["-h", "/tmp/pgtest", "-p", "54329", "-U", "postgres", "-d", process.env.TEST_DB || "zou", "-qAt", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", "-"],
    { encoding: "utf8", input: sql + ";\n", maxBuffer: 256 * 1024 * 1024 });
}

export function neon(url) {
  return {
    // Comme le vrai pilote : une seule transaction pour toutes les requêtes.
    async transaction(fn) {
      const queries = fn({ query: (text, params = []) => inline(text, params) });
      const r = psql(queries.join(";\n"));
      if (r.status !== 0) throw new Error("sql_error: " + r.stderr.trim().split("\n")[0]);
      return queries.map(() => []);
    },
    async query(text, params = []) {
      let sql = inline(text, params);
      const isDml = /^(insert|update|delete)/i.test(sql);
      if (isDml && /returning/i.test(sql)) sql = `WITH t AS (${sql}) SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM t`;
      else if (/^(select|with)/i.test(sql)) sql = `SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (${sql}) t`;
      const r = psql(sql);
      if (r.status !== 0) throw new Error("sql_error: " + r.stderr.trim().split("\n")[0]);
      const out = r.stdout.trim();
      if (/^\[/.test(out)) return JSON.parse(out).map((row) => {
        // pg renvoie les timestamptz en Date : on imite pour rester fidèle au vrai pilote
        for (const k of Object.keys(row)) if (typeof row[k] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(row[k])) row[k] = new Date(row[k]);
        return row;
      });
      return [];
    },
  };
}

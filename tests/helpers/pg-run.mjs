// Exécute une suite d'étapes SQL sur un Postgres embarqué (PGlite) et renvoie les résultats en JSON.
// Lancé dans un processus Node séparé : PGlite charge ses fichiers WebAssembly hors du bac à sable de Jest.
// Entrée (stdin) : { steps: [{ exec } | { name, query, params }] }
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";

const { steps } = JSON.parse(readFileSync(0, "utf8"));
const db = new PGlite({ extensions: { pg_trgm } });
const out = {};
let error = null;
try {
  for (const step of steps) {
    if (step.exec) await db.exec(step.exec);
    else {
      const r = await db.query(step.query, step.params || []);
      if (step.name) out[step.name] = r.rows;
    }
  }
} catch (e) {
  error = e.message;
}
await db.close();
process.stdout.write(JSON.stringify({ error, out }));

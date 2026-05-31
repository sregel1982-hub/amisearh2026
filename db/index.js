import { neon } from "@netlify/neon";
import { drizzle } from "drizzle-orm/neon-http";

/**
 * Lazy initialization: a drizzle() csak akkor fut le, amikor először
 * használjuk a `db`-t (nem modul betöltéskor).
 *
 * A Netlify Neon extension régebbi verzió `NETLIFY_DB_URL`-t,
 * újabb pedig `NETLIFY_DATABASE_URL`-t használ — mindkettőt elfogadjuk.
 */
function resolveConnectionString() {
  return (
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL
  );
}

let _db = null;
function getDb() {
  if (!_db) {
    const connStr = resolveConnectionString();
    if (!connStr) {
      throw new Error(
        "Adatbázis kapcsolati string hiányzik. Várt env változó: " +
          "NETLIFY_DATABASE_URL, NETLIFY_DB_URL, DATABASE_URL vagy NEON_DATABASE_URL."
      );
    }
    const sql = neon(connStr);
    _db = drizzle(sql);
  }
  return _db;
}

export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const instance = getDb();
      const value = instance[prop];
      return typeof value === "function" ? value.bind(instance) : value;
    }
  }
);

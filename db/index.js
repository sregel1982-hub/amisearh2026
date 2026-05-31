import { neon } from "@netlify/neon";
import { drizzle } from "drizzle-orm/neon-http";

/**
 * Lazy initialization: a drizzle() csak akkor fut le, amikor először
 * használjuk a `db`-t (nem modul betöltéskor). Ez megakadályozza,
 * hogy a függvény "Failed to create function" hibával elszálljon,
 * ha a NETLIFY_DATABASE_URL env változó éppen nincs beállítva.
 */
let _db = null;
function getDb() {
  if (!_db) {
    const sql = neon(); // automatikusan használja a NETLIFY_DATABASE_URL-t
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

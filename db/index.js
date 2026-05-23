import { drizzle } from "drizzle-orm/netlify-db";

// Lazy initialization: a drizzle() csak akkor fut le, amikor először
// használjuk a `db`-t (nem modul betöltéskor). Ez megakadályozza, hogy
// a függvény "Failed to create function" hibával elszálljon, ha a
// NETLIFY_DB_URL env változó éppen nincs beállítva induláskor.
let _db = null;
function getDb() {
  if (!_db) {
    _db = drizzle();
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




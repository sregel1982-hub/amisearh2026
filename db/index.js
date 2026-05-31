import { neon } from "@netlify/neon";
import { drizzle } from "drizzle-orm/neon-http";

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
      throw new Error("DB connection string missing");
    }
    const sql = neon(connStr);
    _db = drizzle(sql);
  }
  return _db;
}

export const db = new Proxy({}, {
  get(_target, prop) {
    const instance = getDb();
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  }
});

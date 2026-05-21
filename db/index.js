process.env.NETLIFY) {
  const { connect } = await import("@netlify/database");
  const { drizzle } = await import("drizzle-orm/netlify-db");
  const client = connect();
  db = drizzle(client);
} else {
  const pg = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const Pool = pg.default.Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool);
}

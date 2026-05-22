import { connect } from "@netlify/database";
import { drizzle } from "drizzle-orm/netlify-db";

const client = connect();
export const db = drizzle(client);

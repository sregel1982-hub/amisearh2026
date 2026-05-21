import { connect } from "@netlify/database";
import { drizzle } from "drizzle-orm/netlify";

const client = connect();

export const db = drizzle(client);

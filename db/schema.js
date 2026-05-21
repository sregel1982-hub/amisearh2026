import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const userProfiles = pgTable("user_profiles", {
  id: text("id").primaryKey(),
  identityId: text("identity_id").unique(),
  fullName: text("full_name"),
  username: text("username").unique(),
  email: text("email"),
  status: text("status").default("student"),
  plan: text("plan").default("Free"),
  points: integer("points").default(0),
  created_at: timestamp("created_at").defaultNow(),
});

export const uploadedNotes = pgTable("uploaded_notes", {
  id: text("id").primaryKey(),
  user_id: text("user_id"),
  file_name: text("file_name"),
  text_content: text("text_content"),
  created_at: timestamp("created_at").defaultNow(),
});

export const siteRatings = pgTable("site_ratings", {
  id: text("id").primaryKey(),
  user_id: text("user_id"),
  rating: integer("rating"),
  created_at: timestamp("created_at").defaultNow(),
});


import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

// 1) user_profiles
export const userProfiles = pgTable("user_profiles", {
  id: text("id").primaryKey(),
  email: text("email"),
  points: integer("points").default(0),
  created_at: timestamp("created_at").defaultNow(),
});

// 2) uploaded_notes
export const uploadedNotes = pgTable("uploaded_notes", {
  id: text("id").primaryKey(),
  user_id: text("user_id"),
  file_name: text("file_name"),
  text_content: text("text_content"),
  created_at: timestamp("created_at").defaultNow(),
});

// 3) site_ratings
export const siteRatings = pgTable("site_ratings", {
  id: text("id").primaryKey(),
  user_id: text("user_id"),
  rating: integer("rating"),
  created_at: timestamp("created_at").defaultNow(),
});

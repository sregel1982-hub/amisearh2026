import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const userProfiles = pgTable("user_profiles", {
  id: serial().primaryKey(),
  identityId: text("identity_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  username: text("username").notNull().unique(),
  status: text("status").notNull().default("student"),
  email: text("email").notNull(),
  points: integer("points").notNull().default(0),
  plan: text("plan").notNull().default("Free"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const uploadedNotes = pgTable("uploaded_notes", {
  id: serial().primaryKey(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  publicUrl: text("public_url").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  uploaderIdentityId: text("uploader_identity_id"),
  textContent: text("text_content"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const siteRatings = pgTable("site_ratings", {
  id: serial().primaryKey(),
  rating: integer("rating").notNull(),
  ipHash: text("ip_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

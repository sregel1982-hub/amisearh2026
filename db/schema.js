import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  identityId: text("identity_id").unique().notNull(),
  fullName: text("full_name").notNull(),
  username: text("username").unique().notNull(),
  status: text("status").default("student").notNull(),
  email: text("email").notNull(),
  points: integer("points").default(0).notNull(),
  plan: text("plan").default("Free").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const uploadedNotes = pgTable("uploaded_notes", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  publicUrl: text("public_url").notNull(),
  fileSize: integer("file_size").default(0).notNull(),
  uploaderIdentityId: text("uploader_identity_id"),
  textContent: text("text_content"),
  title: text("title"),
  subject: text("subject"),
  language: text("language"),
  fileHash: text("file_hash"),
  textHash: text("text_hash"),
  shingleSignature: jsonb("shingle_signature"),
  plagiarismScore: integer("plagiarism_score"),
  similarNoteIds: jsonb("similar_note_ids"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const siteRatings = pgTable("site_ratings", {
  id: serial("id").primaryKey(),
  rating: integer("rating").notNull(),
  ipHash: text("ip_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

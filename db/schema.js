import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  bigint
} from "drizzle-orm/pg-core";

/* User profilok ------------------------------------------------- */
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  identityId: text("identity_id").notNull().unique(),
  fullName: text("full_name"),
  username: text("username"),
  status: text("status"),
  email: text("email"),
  points: integer("points").default(0),
  plan: text("plan").default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

/* Feltöltött jegyzetek ----------------------------------------- */
export const uploadedNotes = pgTable("uploaded_notes", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name"),
  publicUrl: text("public_url"),
  fileSize: bigint("file_size", { mode: "number" }),
  uploaderIdentityId: text("uploader_identity_id"),
  textContent: text("text_content"),

  /* Új mezők — feltöltési metaadatok és plágium ellenőrzés */
  title: text("title"),
  subject: text("subject"),
  language: text("language"),
  fileHash: text("file_hash"),
  textHash: text("text_hash"),
  shingleSignature: jsonb("shingle_signature"),
  plagiarismScore: integer("plagiarism_score"),     // 0-100, NULL ha nincs vizsgálva
  similarNoteIds: jsonb("similar_note_ids"),         // [{id, score}] tömb

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

/* Webhely értékelések ----------------------------------------- */
export const siteRatings = pgTable("site_ratings", {
  id: serial("id").primaryKey(),
  rating: integer("rating").notNull(),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

ALTER TABLE "uploaded_notes"
  ADD COLUMN IF NOT EXISTS "title" text,
  ADD COLUMN IF NOT EXISTS "subject" text,
  ADD COLUMN IF NOT EXISTS "language" text,
  ADD COLUMN IF NOT EXISTS "file_hash" text,
  ADD COLUMN IF NOT EXISTS "text_hash" text,
  ADD COLUMN IF NOT EXISTS "shingle_signature" jsonb,
  ADD COLUMN IF NOT EXISTS "plagiarism_score" integer,
  ADD COLUMN IF NOT EXISTS "similar_note_ids" jsonb;

CREATE INDEX IF NOT EXISTS "idx_uploaded_notes_file_hash" ON "uploaded_notes" ("file_hash");
CREATE INDEX IF NOT EXISTS "idx_uploaded_notes_text_hash" ON "uploaded_notes" ("text_hash");
CREATE INDEX IF NOT EXISTS "idx_uploaded_notes_subject" ON "uploaded_notes" ("subject");
CREATE INDEX IF NOT EXISTS "idx_uploaded_notes_uploader" ON "uploaded_notes" ("uploader_identity_id");

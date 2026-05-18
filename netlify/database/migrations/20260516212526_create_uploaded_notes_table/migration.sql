CREATE TABLE "uploaded_notes" (
	"id" serial PRIMARY KEY,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"public_url" text NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"uploader_identity_id" text,
	"created_at" timestamp DEFAULT now()
);

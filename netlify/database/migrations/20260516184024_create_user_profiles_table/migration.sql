CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY,
	"identity_id" text NOT NULL UNIQUE,
	"full_name" text NOT NULL,
	"username" text NOT NULL UNIQUE,
	"status" text DEFAULT 'student' NOT NULL,
	"email" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"plan" text DEFAULT 'Free' NOT NULL,
	"created_at" timestamp DEFAULT now()
);

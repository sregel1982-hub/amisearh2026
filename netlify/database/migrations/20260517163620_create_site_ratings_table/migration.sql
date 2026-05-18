CREATE TABLE "site_ratings" (
	"id" serial PRIMARY KEY,
	"rating" integer NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

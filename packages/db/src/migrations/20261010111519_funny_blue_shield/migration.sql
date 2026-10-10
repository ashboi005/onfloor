CREATE TABLE "knowledge_sources" (
	"id" serial PRIMARY KEY,
	"scope" text NOT NULL,
	"scope_key" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"chunks" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_scope_source_idx" ON "knowledge_sources" ("scope","scope_key","source");
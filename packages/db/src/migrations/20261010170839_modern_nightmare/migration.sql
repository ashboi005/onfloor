CREATE TABLE "merchants" (
	"id" text PRIMARY KEY,
	"uid" text NOT NULL,
	"restaurant_name" text NOT NULL,
	"source" text NOT NULL,
	"source_persona_id" text,
	"body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_actions" (
	"id" serial PRIMARY KEY,
	"call_id" text NOT NULL,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"body" jsonb NOT NULL,
	"at_ms" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "merchant_id" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "guidance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_uid_idx" ON "merchants" ("uid");--> statement-breakpoint
CREATE INDEX "merchants_source_idx" ON "merchants" ("source");--> statement-breakpoint
CREATE INDEX "workspace_actions_call_idx" ON "workspace_actions" ("call_id");--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_merchant_id_merchants_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id");--> statement-breakpoint
ALTER TABLE "workspace_actions" ADD CONSTRAINT "workspace_actions_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;
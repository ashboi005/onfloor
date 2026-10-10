CREATE TABLE "calls" (
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"agent_id" text NOT NULL,
	"scenario_id" text,
	"persona_id" text,
	"replay_of_call_id" text,
	"language" text NOT NULL,
	"customer_label" text NOT NULL,
	"external_customer_id" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_ms" integer,
	"recording_url" text,
	"overall_score" integer
);
--> statement-breakpoint
CREATE TABLE "crm_actions" (
	"id" serial PRIMARY KEY,
	"call_id" text NOT NULL,
	"field" text NOT NULL,
	"from" jsonb,
	"to" jsonb,
	"at_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_requests_voiced" (
	"id" serial PRIMARY KEY,
	"call_id" text NOT NULL,
	"request_id" text NOT NULL,
	"at_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_events" (
	"id" serial PRIMARY KEY,
	"call_id" text NOT NULL,
	"at_ms" integer NOT NULL,
	"type" text NOT NULL,
	"body" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"archetype" text NOT NULL,
	"language" text NOT NULL,
	"source" text NOT NULL,
	"source_call_id" text,
	"body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY,
	"body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"call_id" text PRIMARY KEY,
	"body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_turns" (
	"id" text PRIMARY KEY,
	"call_id" text NOT NULL,
	"seq" integer NOT NULL,
	"speaker" text NOT NULL,
	"text" text NOT NULL,
	"language" text,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'agent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "calls_agent_idx" ON "calls" ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "calls_status_idx" ON "calls" ("status");--> statement-breakpoint
CREATE INDEX "crm_actions_call_idx" ON "crm_actions" ("call_id");--> statement-breakpoint
CREATE INDEX "crm_requests_voiced_call_idx" ON "crm_requests_voiced" ("call_id");--> statement-breakpoint
CREATE INDEX "live_events_call_idx" ON "live_events" ("call_id","at_ms");--> statement-breakpoint
CREATE INDEX "personas_source_idx" ON "personas" ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_turns_call_seq_idx" ON "transcript_turns" ("call_id","seq");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_user_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_scenario_id_scenarios_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios"("id");--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_persona_id_personas_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id");--> statement-breakpoint
ALTER TABLE "crm_actions" ADD CONSTRAINT "crm_actions_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "crm_requests_voiced" ADD CONSTRAINT "crm_requests_voiced_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "live_events" ADD CONSTRAINT "live_events_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_call_id_calls_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
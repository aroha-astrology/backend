CREATE TYPE "public"."cron_batch_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_batch_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"period" text NOT NULL,
	"for_date" text NOT NULL,
	"status" "cron_batch_run_status" DEFAULT 'running' NOT NULL,
	"last_id" uuid,
	"processed" integer DEFAULT 0 NOT NULL,
	"generated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cron_batch_runs_job_period_date_idx" ON "cron_batch_runs" USING btree ("job_name","period","for_date");
DO $$ BEGIN
 CREATE TYPE "public"."transit_event_type" AS ENUM('ingress', 'retrograde', 'direct');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transit_event_status" AS ENUM('detected', 'drafted', 'sent', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planet" text NOT NULL,
	"event_type" "transit_event_type" NOT NULL,
	"from_sign" text NOT NULL,
	"to_sign" text,
	"exact_at" timestamp with time zone NOT NULL,
	"for_date" text NOT NULL,
	"push_at" timestamp with time zone NOT NULL,
	"weight" integer DEFAULT 0 NOT NULL,
	"status" "transit_event_status" DEFAULT 'detected' NOT NULL,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transit_alert_copy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"moon_sign" text,
	"lang" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transit_alert_copy" ADD CONSTRAINT "transit_alert_copy_event_id_transit_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."transit_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transit_events_planet_type_date_idx" ON "transit_events" USING btree ("planet","event_type","for_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transit_events_push_at_idx" ON "transit_events" USING btree ("push_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transit_alert_copy_event_sign_lang_idx" ON "transit_alert_copy" USING btree ("event_id","moon_sign","lang") WHERE "transit_alert_copy"."moon_sign" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transit_alert_copy_event_lang_nosign_idx" ON "transit_alert_copy" USING btree ("event_id","lang") WHERE "transit_alert_copy"."moon_sign" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_type_created_idx" ON "notifications" USING btree ("user_id","type","created_at");

-- user_feedback: our own in-app star rating + written comment.
--
-- Nothing to do with the Google Play review card the Android shell can show —
-- that API reports no rating and no outcome back to us, so it can never
-- produce a row here.
--
-- Guarded so it is safe to re-run: this repo has a history of migrations being
-- applied by hand on the box and then reconciled in the journal afterwards.
CREATE TABLE IF NOT EXISTS "user_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_feedback_user_id_idx" ON "user_feedback" USING btree ("user_id");

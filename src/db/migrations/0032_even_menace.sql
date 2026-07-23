CREATE TABLE IF NOT EXISTS "palm_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"birth_profile_id" uuid,
	"image_base64" text NOT NULL,
	"mime_type" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "palm_photos" ADD CONSTRAINT "palm_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "palm_photos" ADD CONSTRAINT "palm_photos_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "palm_photos_primary_unique" ON "palm_photos" USING btree ("user_id") WHERE "palm_photos"."birth_profile_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "palm_photos_profile_unique" ON "palm_photos" USING btree ("user_id","birth_profile_id") WHERE "palm_photos"."birth_profile_id" is not null;
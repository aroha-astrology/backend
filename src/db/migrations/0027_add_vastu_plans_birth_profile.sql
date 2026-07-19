ALTER TABLE "vastu_plans" ADD COLUMN "birth_profile_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vastu_plans" ADD CONSTRAINT "vastu_plans_birth_profile_id_birth_profiles_id_fk" FOREIGN KEY ("birth_profile_id") REFERENCES "public"."birth_profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

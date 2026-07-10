ALTER TABLE "users" ADD COLUMN "credits" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "unlocked_houses" integer[] DEFAULT ARRAY[1]::integer[] NOT NULL;
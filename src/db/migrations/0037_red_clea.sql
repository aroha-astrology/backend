CREATE TYPE "public"."booking_message_sender_role" AS ENUM('customer', 'provider');--> statement-breakpoint
CREATE TYPE "public"."booking_message_type" AS ENUM('astrologer', 'pooja');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "booking_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_type" "booking_message_type" NOT NULL,
	"booking_id" uuid NOT NULL,
	"sender_role" "booking_message_sender_role" NOT NULL,
	"sender_user_id" uuid,
	"sender_provider_account_id" uuid,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_messages_booking_idx" ON "booking_messages" USING btree ("booking_type","booking_id","created_at");
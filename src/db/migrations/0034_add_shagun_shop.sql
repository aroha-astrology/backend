CREATE TYPE "public"."shagun_product_category" AS ENUM('gemstone', 'rudraksha', 'yantra', 'mala', 'idol', 'puja-item', 'gift-set');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shagun_click_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shagun_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "shagun_product_category" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_range_text" text,
	"affiliate_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shagun_click_events" ADD CONSTRAINT "shagun_click_events_product_id_shagun_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shagun_products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shagun_click_events" ADD CONSTRAINT "shagun_click_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shagun_click_events_product_id_idx" ON "shagun_click_events" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shagun_products_active_category_sort_idx" ON "shagun_products" USING btree ("category","sort_order") WHERE "shagun_products"."is_active" = true;
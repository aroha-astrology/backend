CREATE TABLE "panchang_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"for_date" date NOT NULL,
	"ref_key" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "panchang_cache_date_ref_unique" ON "panchang_cache" USING btree ("for_date","ref_key");

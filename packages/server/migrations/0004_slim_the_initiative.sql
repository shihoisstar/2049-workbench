CREATE TABLE "wb_next"."media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_hash" CHECK ("wb_next"."media_assets"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_size" CHECK ("wb_next"."media_assets"."byte_length" between 1 and 67108864 and "wb_next"."media_assets"."width" between 16 and 4096 and "wb_next"."media_assets"."height" between 16 and 4096 and "wb_next"."media_assets"."duration_ms" between 500 and 7000),
	CONSTRAINT "media_key" CHECK ("wb_next"."media_assets"."object_key" = 'jobs/' || "wb_next"."media_assets"."job_id"::text || '/' || "wb_next"."media_assets"."sha256" || '.mp4'),
	CONSTRAINT "media_expiry" CHECK ("wb_next"."media_assets"."expires_at" > "wb_next"."media_assets"."created_at")
);
--> statement-breakpoint
ALTER TABLE "wb_next"."media_assets" ADD CONSTRAINT "media_assets_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_job_uq" ON "wb_next"."media_assets" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_object_uq" ON "wb_next"."media_assets" USING btree ("object_key");
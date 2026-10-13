CREATE TABLE "wb_next"."native_marketing_media" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"source_object_key" text NOT NULL,
	"source_sha256" text NOT NULL,
	"byte_length" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"state" text DEFAULT 'transcribing' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"recognized_cues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_cues" jsonb,
	"confirmation_request_key" uuid,
	"confirmation_hash" text,
	"issue" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "native_media_source" CHECK ("wb_next"."native_marketing_media"."source_sha256" ~ '^[a-f0-9]{64}$' and "wb_next"."native_marketing_media"."source_object_key" = 'native-marketing-source/' || "wb_next"."native_marketing_media"."job_id"::text || '/' || "wb_next"."native_marketing_media"."source_sha256" || '.mp4' and "wb_next"."native_marketing_media"."byte_length" between 1 and 67108864 and "wb_next"."native_marketing_media"."width" between 720 and 4096 and "wb_next"."native_marketing_media"."height" between 720 and 4096 and "wb_next"."native_marketing_media"."duration_ms" between 9700 and 10300 and "wb_next"."native_marketing_media"."expires_at" > "wb_next"."native_marketing_media"."created_at"),
	CONSTRAINT "native_media_state" CHECK (("wb_next"."native_marketing_media"."state" = 'transcribing' and "wb_next"."native_marketing_media"."revision" = 0 and "wb_next"."native_marketing_media"."confirmed_cues" is null and "wb_next"."native_marketing_media"."confirmation_request_key" is null and "wb_next"."native_marketing_media"."confirmation_hash" is null) or ("wb_next"."native_marketing_media"."state" = 'review' and "wb_next"."native_marketing_media"."revision" = 1 and "wb_next"."native_marketing_media"."confirmed_cues" is null and "wb_next"."native_marketing_media"."confirmation_request_key" is null and "wb_next"."native_marketing_media"."confirmation_hash" is null) or ("wb_next"."native_marketing_media"."state" = 'ready' and "wb_next"."native_marketing_media"."revision" = 2 and "wb_next"."native_marketing_media"."confirmed_cues" is not null and "wb_next"."native_marketing_media"."confirmation_request_key" is not null and "wb_next"."native_marketing_media"."confirmation_hash" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "native_media_issue" CHECK ("wb_next"."native_marketing_media"."issue" is null or "wb_next"."native_marketing_media"."issue" in ('transcription_failed', 'render_failed'))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."native_marketing_media" ADD CONSTRAINT "native_marketing_media_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;
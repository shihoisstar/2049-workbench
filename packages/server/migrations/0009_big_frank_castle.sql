CREATE TABLE "wb_next"."drama_shot_video_assets" (
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
	CONSTRAINT "drama_shot_video_assets_hash" CHECK ("wb_next"."drama_shot_video_assets"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "drama_shot_video_assets_size" CHECK ("wb_next"."drama_shot_video_assets"."byte_length" between 1 and 67108864 and "wb_next"."drama_shot_video_assets"."width" between 16 and 4096 and "wb_next"."drama_shot_video_assets"."height" between 16 and 4096 and "wb_next"."drama_shot_video_assets"."duration_ms" between 500 and 7000),
	CONSTRAINT "drama_shot_video_assets_key" CHECK ("wb_next"."drama_shot_video_assets"."object_key" = 'drama-shot-video-jobs/' || "wb_next"."drama_shot_video_assets"."job_id"::text || '/' || "wb_next"."drama_shot_video_assets"."sha256" || '.mp4'),
	CONSTRAINT "drama_shot_video_assets_expiry" CHECK ("wb_next"."drama_shot_video_assets"."expires_at" > "wb_next"."drama_shot_video_assets"."created_at")
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_shot_video_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shot_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"billing_key" text NOT NULL,
	"model" text NOT NULL,
	"reserved_credits" bigint NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"output_ref" text,
	"actual_credits" bigint,
	"actual_cost_cents" bigint,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "drama_shot_video_jobs_request_key" CHECK (length(btrim("wb_next"."drama_shot_video_jobs"."request_key")) between 1 and 200 and length("wb_next"."drama_shot_video_jobs"."request_key") <= 200),
	CONSTRAINT "drama_shot_video_jobs_model" CHECK (length(btrim("wb_next"."drama_shot_video_jobs"."model")) between 1 and 200 and length("wb_next"."drama_shot_video_jobs"."model") <= 200),
	CONSTRAINT "drama_shot_video_jobs_amounts" CHECK ("wb_next"."drama_shot_video_jobs"."reserved_credits" between 1 and 9007199254740991 and ("wb_next"."drama_shot_video_jobs"."actual_cost_cents" is null or "wb_next"."drama_shot_video_jobs"."actual_cost_cents" between 0 and 9007199254740991)),
	CONSTRAINT "drama_shot_video_jobs_state" CHECK (("wb_next"."drama_shot_video_jobs"."status" = 'accepted' and "wb_next"."drama_shot_video_jobs"."output_ref" is null and "wb_next"."drama_shot_video_jobs"."actual_credits" is null and "wb_next"."drama_shot_video_jobs"."actual_cost_cents" is null and "wb_next"."drama_shot_video_jobs"."failure_code" is null and "wb_next"."drama_shot_video_jobs"."finished_at" is null) or ("wb_next"."drama_shot_video_jobs"."status" = 'succeeded' and "wb_next"."drama_shot_video_jobs"."output_ref" is not null and length("wb_next"."drama_shot_video_jobs"."output_ref") between 1 and 500 and "wb_next"."drama_shot_video_jobs"."actual_credits" is not null and "wb_next"."drama_shot_video_jobs"."actual_credits" between 0 and "wb_next"."drama_shot_video_jobs"."reserved_credits" and "wb_next"."drama_shot_video_jobs"."failure_code" is null and "wb_next"."drama_shot_video_jobs"."finished_at" is not null) or ("wb_next"."drama_shot_video_jobs"."status" = 'failed' and "wb_next"."drama_shot_video_jobs"."failure_code" is not null and length("wb_next"."drama_shot_video_jobs"."failure_code") between 1 and 200 and "wb_next"."drama_shot_video_jobs"."output_ref" is null and "wb_next"."drama_shot_video_jobs"."actual_credits" is null and "wb_next"."drama_shot_video_jobs"."actual_cost_cents" is null and "wb_next"."drama_shot_video_jobs"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_shot_video_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text DEFAULT 'drama_video.requested' NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "drama_shot_video_outbox_event" CHECK ("wb_next"."drama_shot_video_outbox"."type" in ('drama_video.requested', 'drama_video.resume') and "wb_next"."drama_shot_video_outbox"."workflow_id" = 'drama-video:' || "wb_next"."drama_shot_video_outbox"."job_id"::text and "wb_next"."drama_shot_video_outbox"."attempts" >= 0),
	CONSTRAINT "drama_shot_video_outbox_state" CHECK (("wb_next"."drama_shot_video_outbox"."status" = 'pending' and "wb_next"."drama_shot_video_outbox"."lease_token" is null and "wb_next"."drama_shot_video_outbox"."lease_until" is null and "wb_next"."drama_shot_video_outbox"."delivered_at" is null) or ("wb_next"."drama_shot_video_outbox"."status" = 'leased' and "wb_next"."drama_shot_video_outbox"."lease_token" is not null and "wb_next"."drama_shot_video_outbox"."lease_until" is not null and "wb_next"."drama_shot_video_outbox"."delivered_at" is null) or ("wb_next"."drama_shot_video_outbox"."status" = 'delivered' and "wb_next"."drama_shot_video_outbox"."lease_token" is null and "wb_next"."drama_shot_video_outbox"."lease_until" is null and "wb_next"."drama_shot_video_outbox"."delivered_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_shot_video_submissions" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"provider_key" text NOT NULL,
	"token" uuid NOT NULL,
	"status" text DEFAULT 'submitting' NOT NULL,
	"provider_task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_shot_video_submissions_provider_key" CHECK (length(btrim("wb_next"."drama_shot_video_submissions"."provider_key")) between 1 and 200 and length("wb_next"."drama_shot_video_submissions"."provider_key") <= 200),
	CONSTRAINT "drama_shot_video_submissions_state" CHECK (("wb_next"."drama_shot_video_submissions"."status" in ('submitting', 'unknown', 'rejected') and "wb_next"."drama_shot_video_submissions"."provider_task_id" is null) or ("wb_next"."drama_shot_video_submissions"."status" = 'submitted' and "wb_next"."drama_shot_video_submissions"."provider_task_id" is not null and length(btrim("wb_next"."drama_shot_video_submissions"."provider_task_id")) between 1 and 500 and length("wb_next"."drama_shot_video_submissions"."provider_task_id") <= 500))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_assets" ADD CONSTRAINT "drama_shot_video_assets_job_id_drama_shot_video_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."drama_shot_video_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_assets" ADD CONSTRAINT "drama_shot_video_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_jobs" ADD CONSTRAINT "drama_shot_video_jobs_shot_id_drama_storyboard_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "wb_next"."drama_storyboard_shots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_jobs" ADD CONSTRAINT "drama_shot_video_jobs_candidate_id_drama_storyboard_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "wb_next"."drama_storyboard_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_jobs" ADD CONSTRAINT "drama_shot_video_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_jobs" ADD CONSTRAINT "drama_shot_video_jobs_user_id_billing_key_reservations_user_id_billing_key_fk" FOREIGN KEY ("user_id","billing_key") REFERENCES "wb_next"."reservations"("user_id","billing_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_outbox" ADD CONSTRAINT "drama_shot_video_outbox_job_id_drama_shot_video_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."drama_shot_video_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_shot_video_submissions" ADD CONSTRAINT "drama_shot_video_submissions_job_id_drama_shot_video_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."drama_shot_video_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_shot_video_assets_job_uq" ON "wb_next"."drama_shot_video_assets" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_shot_video_assets_object_uq" ON "wb_next"."drama_shot_video_assets" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_shot_video_jobs_request_uq" ON "wb_next"."drama_shot_video_jobs" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_shot_video_jobs_billing_uq" ON "wb_next"."drama_shot_video_jobs" USING btree ("user_id","billing_key");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_shot_video_jobs_active_uq" ON "wb_next"."drama_shot_video_jobs" USING btree ("shot_id") WHERE "wb_next"."drama_shot_video_jobs"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX "drama_shot_video_jobs_shot_idx" ON "wb_next"."drama_shot_video_jobs" USING btree ("shot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_shot_video_outbox_request_uq" ON "wb_next"."drama_shot_video_outbox" USING btree ("job_id") WHERE "wb_next"."drama_shot_video_outbox"."type" = 'drama_video.requested';--> statement-breakpoint
CREATE UNIQUE INDEX "drama_shot_video_outbox_resume_uq" ON "wb_next"."drama_shot_video_outbox" USING btree ("job_id") WHERE "wb_next"."drama_shot_video_outbox"."type" = 'drama_video.resume';--> statement-breakpoint
CREATE INDEX "drama_shot_video_outbox_claim_idx" ON "wb_next"."drama_shot_video_outbox" USING btree ("status","available_at");
CREATE TABLE "wb_next"."drama_script_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"quote_version" text NOT NULL,
	"binding" jsonb,
	"credits_per_episode" bigint NOT NULL,
	"estimated_cost_cents" bigint,
	"episode_count" integer NOT NULL,
	"reused" jsonb NOT NULL,
	"maximum_characters" integer NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"output_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "script_batch_scope" CHECK ("wb_next"."drama_script_batches"."episode_count" between 1 and 40 and "wb_next"."drama_script_batches"."maximum_characters" between 1 and 900 and "wb_next"."drama_script_batches"."credits_per_episode" between 0 and 9007199254740991),
	CONSTRAINT "script_batch_state" CHECK (("wb_next"."drama_script_batches"."status" = 'accepted' and "wb_next"."drama_script_batches"."output_version_id" is null and "wb_next"."drama_script_batches"."finished_at" is null) or ("wb_next"."drama_script_batches"."status" = 'succeeded' and "wb_next"."drama_script_batches"."output_version_id" is not null and "wb_next"."drama_script_batches"."finished_at" is not null) or ("wb_next"."drama_script_batches"."status" = 'needs_attention' and "wb_next"."drama_script_batches"."output_version_id" is null and "wb_next"."drama_script_batches"."finished_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" DROP CONSTRAINT "drama_script_job_submission";--> statement-breakpoint
DROP INDEX "wb_next"."drama_script_job_active_uq";--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD COLUMN "episode_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD COLUMN "batch_ready" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_batches" ADD CONSTRAINT "drama_script_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_batches" ADD CONSTRAINT "drama_script_batches_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_batches" ADD CONSTRAINT "drama_script_batches_output_version_id_drama_script_versions_id_fk" FOREIGN KEY ("output_version_id") REFERENCES "wb_next"."drama_script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "script_batch_request_uq" ON "wb_next"."drama_script_batches" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "script_batch_active_uq" ON "wb_next"."drama_script_batches" USING btree ("project_id") WHERE "wb_next"."drama_script_batches"."status" = 'accepted';--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD CONSTRAINT "drama_script_jobs_batch_id_drama_script_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "wb_next"."drama_script_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_script_job_batch_episode_uq" ON "wb_next"."drama_script_jobs" USING btree ("batch_id","episode_number");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_script_job_active_uq" ON "wb_next"."drama_script_jobs" USING btree ("project_id") WHERE "wb_next"."drama_script_jobs"."status" = 'accepted' and "wb_next"."drama_script_jobs"."batch_id" is null;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD CONSTRAINT "drama_script_job_batch" CHECK ("wb_next"."drama_script_jobs"."episode_number" between 1 and 40 and "wb_next"."drama_script_jobs"."batch_ready" in (0, 1) and ("wb_next"."drama_script_jobs"."batch_id" is not null or "wb_next"."drama_script_jobs"."episode_number" = 1 and "wb_next"."drama_script_jobs"."batch_ready" = 0));--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD CONSTRAINT "drama_script_job_submission" CHECK ((("wb_next"."drama_script_jobs"."submission_state" is null and "wb_next"."drama_script_jobs"."submission_token" is null and "wb_next"."drama_script_jobs"."request" is null and "wb_next"."drama_script_jobs"."submitted_at" is null and ("wb_next"."drama_script_jobs"."binding" is null or "wb_next"."drama_script_jobs"."status" = 'accepted' and "wb_next"."drama_script_jobs"."response" is null or "wb_next"."drama_script_jobs"."batch_id" is not null and "wb_next"."drama_script_jobs"."batch_ready" = 0 and "wb_next"."drama_script_jobs"."status" = 'failed' and "wb_next"."drama_script_jobs"."failure_code" = 'SCRIPT_BATCH_PAUSED' and "wb_next"."drama_script_jobs"."response" is null)) or ("wb_next"."drama_script_jobs"."binding" is not null and "wb_next"."drama_script_jobs"."submission_token" is not null and "wb_next"."drama_script_jobs"."request" is not null and "wb_next"."drama_script_jobs"."submitted_at" is not null and ("wb_next"."drama_script_jobs"."submission_state" in ('submitting', 'unknown') and "wb_next"."drama_script_jobs"."status" = 'accepted' and "wb_next"."drama_script_jobs"."response" is null or "wb_next"."drama_script_jobs"."submission_state" = 'received' and "wb_next"."drama_script_jobs"."response" is not null or "wb_next"."drama_script_jobs"."submission_state" = 'rejected' and "wb_next"."drama_script_jobs"."status" = 'failed' and "wb_next"."drama_script_jobs"."response" is null))) is true);
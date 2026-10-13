CREATE TABLE "wb_next"."drama_export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"episode_number" integer NOT NULL,
	"request_key" text NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"output_ref" text,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "drama_export_jobs_request_key" CHECK (length(btrim("wb_next"."drama_export_jobs"."request_key")) between 1 and 200 and length("wb_next"."drama_export_jobs"."request_key") <= 200),
	CONSTRAINT "drama_export_jobs_episode" CHECK ("wb_next"."drama_export_jobs"."episode_number" between 1 and 1000),
	CONSTRAINT "drama_export_jobs_state" CHECK (("wb_next"."drama_export_jobs"."status" = 'accepted' and "wb_next"."drama_export_jobs"."output_ref" is null and "wb_next"."drama_export_jobs"."failure_code" is null and "wb_next"."drama_export_jobs"."finished_at" is null) or ("wb_next"."drama_export_jobs"."status" = 'succeeded' and "wb_next"."drama_export_jobs"."output_ref" is not null and length("wb_next"."drama_export_jobs"."output_ref") between 1 and 500 and "wb_next"."drama_export_jobs"."failure_code" is null and "wb_next"."drama_export_jobs"."finished_at" is not null) or ("wb_next"."drama_export_jobs"."status" = 'failed' and "wb_next"."drama_export_jobs"."output_ref" is null and "wb_next"."drama_export_jobs"."failure_code" is not null and length("wb_next"."drama_export_jobs"."failure_code") between 1 and 200 and "wb_next"."drama_export_jobs"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_export_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"export_job_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"episode_number" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_export_versions_episode" CHECK ("wb_next"."drama_export_versions"."episode_number" between 1 and 1000),
	CONSTRAINT "drama_export_versions_ordinal" CHECK ("wb_next"."drama_export_versions"."ordinal" between 1 and 2147483647),
	CONSTRAINT "drama_export_versions_hash" CHECK ("wb_next"."drama_export_versions"."manifest_sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_export_jobs" ADD CONSTRAINT "drama_export_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_export_jobs" ADD CONSTRAINT "drama_export_jobs_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_export_versions" ADD CONSTRAINT "drama_export_versions_export_job_id_drama_export_jobs_id_fk" FOREIGN KEY ("export_job_id") REFERENCES "wb_next"."drama_export_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_export_versions" ADD CONSTRAINT "drama_export_versions_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_export_jobs_request_uq" ON "wb_next"."drama_export_jobs" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "drama_export_jobs_project_episode_idx" ON "wb_next"."drama_export_jobs" USING btree ("project_id","episode_number","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_export_versions_job_uq" ON "wb_next"."drama_export_versions" USING btree ("export_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_export_versions_ordinal_uq" ON "wb_next"."drama_export_versions" USING btree ("project_id","episode_number","ordinal");
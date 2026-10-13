CREATE TABLE "wb_next"."drama_script_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"output_version_id" uuid,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "drama_script_job_state" CHECK (("wb_next"."drama_script_jobs"."status" = 'accepted' and "wb_next"."drama_script_jobs"."output_version_id" is null and "wb_next"."drama_script_jobs"."failure_code" is null and "wb_next"."drama_script_jobs"."finished_at" is null) or ("wb_next"."drama_script_jobs"."status" = 'succeeded' and "wb_next"."drama_script_jobs"."output_version_id" is not null and "wb_next"."drama_script_jobs"."failure_code" is null and "wb_next"."drama_script_jobs"."finished_at" is not null) or ("wb_next"."drama_script_jobs"."status" = 'failed' and "wb_next"."drama_script_jobs"."output_version_id" is null and "wb_next"."drama_script_jobs"."failure_code" is not null and "wb_next"."drama_script_jobs"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_script_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "drama_script_outbox_workflow" CHECK ("wb_next"."drama_script_outbox"."workflow_id" = 'drama-script:' || "wb_next"."drama_script_outbox"."job_id"::text and "wb_next"."drama_script_outbox"."attempts" >= 0),
	CONSTRAINT "drama_script_outbox_state" CHECK (("wb_next"."drama_script_outbox"."status" = 'pending' and "wb_next"."drama_script_outbox"."lease_token" is null and "wb_next"."drama_script_outbox"."lease_until" is null and "wb_next"."drama_script_outbox"."delivered_at" is null) or ("wb_next"."drama_script_outbox"."status" = 'leased' and "wb_next"."drama_script_outbox"."lease_token" is not null and "wb_next"."drama_script_outbox"."lease_until" is not null and "wb_next"."drama_script_outbox"."delivered_at" is null) or ("wb_next"."drama_script_outbox"."status" = 'delivered' and "wb_next"."drama_script_outbox"."lease_token" is null and "wb_next"."drama_script_outbox"."lease_until" is null and "wb_next"."drama_script_outbox"."delivered_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_versions" DROP CONSTRAINT "drama_script_version_source";--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD COLUMN "confirmed_version_id" uuid;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD CONSTRAINT "drama_script_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD CONSTRAINT "drama_script_jobs_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_jobs" ADD CONSTRAINT "drama_script_jobs_output_version_id_drama_script_versions_id_fk" FOREIGN KEY ("output_version_id") REFERENCES "wb_next"."drama_script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_outbox" ADD CONSTRAINT "drama_script_outbox_job_id_drama_script_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."drama_script_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_script_job_request_uq" ON "wb_next"."drama_script_jobs" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_script_job_active_uq" ON "wb_next"."drama_script_jobs" USING btree ("project_id") WHERE "wb_next"."drama_script_jobs"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX "drama_script_job_project_idx" ON "wb_next"."drama_script_jobs" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_script_outbox_job_uq" ON "wb_next"."drama_script_outbox" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "drama_script_outbox_claim_idx" ON "wb_next"."drama_script_outbox" USING btree ("status","available_at");--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD CONSTRAINT "drama_projects_confirmed_version_id_drama_script_versions_id_fk" FOREIGN KEY ("confirmed_version_id") REFERENCES "wb_next"."drama_script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_versions" ADD CONSTRAINT "drama_script_version_source" CHECK ("wb_next"."drama_script_versions"."source" in ('imported', 'manual_repair', 'mock_generated'));
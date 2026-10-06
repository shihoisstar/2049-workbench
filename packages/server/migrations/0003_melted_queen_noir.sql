CREATE TABLE "wb_next"."provider_submissions" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"provider_key" text NOT NULL,
	"token" uuid NOT NULL,
	"status" text DEFAULT 'submitting' NOT NULL,
	"provider_task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_provider_key" CHECK (length(btrim("wb_next"."provider_submissions"."provider_key")) between 1 and 200 and length("wb_next"."provider_submissions"."provider_key") <= 200),
	CONSTRAINT "submission_state" CHECK (("wb_next"."provider_submissions"."status" in ('submitting', 'unknown', 'rejected') and "wb_next"."provider_submissions"."provider_task_id" is null) or ("wb_next"."provider_submissions"."status" = 'submitted' and "wb_next"."provider_submissions"."provider_task_id" is not null and length(btrim("wb_next"."provider_submissions"."provider_task_id")) between 1 and 500 and length("wb_next"."provider_submissions"."provider_task_id") <= 500))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."provider_submissions" ADD CONSTRAINT "provider_submissions_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;
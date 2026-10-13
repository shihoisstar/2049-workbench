CREATE TABLE "wb_next"."drama_script_reviews" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"request_key" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"prior_state" text NOT NULL,
	"auth_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_script_review_fields" CHECK ("wb_next"."drama_script_reviews"."action" in ('receipt', 'reject') and "wb_next"."drama_script_reviews"."prior_state" in ('submitting', 'unknown') and "wb_next"."drama_script_reviews"."auth_source" = 'ops-token' and "wb_next"."drama_script_reviews"."request_hash" ~ '^[a-f0-9]{64}$' and length(btrim("wb_next"."drama_script_reviews"."reason")) between 8 and 1000 and length(btrim("wb_next"."drama_script_reviews"."evidence_reference")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD COLUMN "preparation" jsonb;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD COLUMN "preparation_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD COLUMN "preparation_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_reviews" ADD CONSTRAINT "drama_script_reviews_job_id_drama_script_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."drama_script_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_script_review_request_uq" ON "wb_next"."drama_script_reviews" USING btree ("request_key");--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD CONSTRAINT "drama_project_preparation" CHECK ((("wb_next"."drama_projects"."preparation" is null and "wb_next"."drama_projects"."preparation_revision" = 0 and "wb_next"."drama_projects"."preparation_updated_at" is null) or (jsonb_typeof("wb_next"."drama_projects"."preparation") = 'object' and "wb_next"."drama_projects"."preparation_revision" > 0 and "wb_next"."drama_projects"."preparation_updated_at" is not null and "wb_next"."drama_projects"."confirmed_version_id" = "wb_next"."drama_projects"."active_version_id" and "wb_next"."drama_projects"."preparation"->>'scriptVersionId' = "wb_next"."drama_projects"."confirmed_version_id"::text)) is true);
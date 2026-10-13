CREATE TABLE "wb_next"."drama_portrait_reviews" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"request_key" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"prior_state" text NOT NULL,
	"auth_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_portrait_review_fields" CHECK ("wb_next"."drama_portrait_reviews"."action" in ('receipt', 'reject') and "wb_next"."drama_portrait_reviews"."prior_state" in ('submitting', 'unknown') and "wb_next"."drama_portrait_reviews"."auth_source" = 'ops-token' and "wb_next"."drama_portrait_reviews"."request_hash" ~ '^[a-f0-9]{64}$' and length(btrim("wb_next"."drama_portrait_reviews"."reason")) between 8 and 1000 and length(btrim("wb_next"."drama_portrait_reviews"."evidence_reference")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_portrait_reviews" ADD CONSTRAINT "drama_portrait_reviews_job_id_drama_image_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."drama_image_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_portrait_review_request_uq" ON "wb_next"."drama_portrait_reviews" USING btree ("request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_portrait_provider_task_uq" ON "wb_next"."drama_image_submissions" USING btree ("provider_key","provider_task_id") WHERE "wb_next"."drama_image_submissions"."provider_key" like 'portrait:%' and "wb_next"."drama_image_submissions"."provider_task_id" is not null;
CREATE TABLE "wb_next"."marketing_copy_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"category" text NOT NULL,
	"source_text" text NOT NULL,
	"quote_version" text NOT NULL,
	"reserved_credits" bigint NOT NULL,
	"estimated_cost_cents" bigint,
	"binding" jsonb,
	"request" jsonb,
	"response" jsonb,
	"result" jsonb,
	"status" text DEFAULT 'accepted' NOT NULL,
	"submission_state" text,
	"token" uuid,
	"billing_state" text NOT NULL,
	"failure_code" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "copy_input" CHECK ("wb_next"."marketing_copy_jobs"."category" in ('commerce', 'store_visit') and length(btrim("wb_next"."marketing_copy_jobs"."source_text")) between 2 and 3000 and length("wb_next"."marketing_copy_jobs"."quote_version") between 1 and 100 and "wb_next"."marketing_copy_jobs"."reserved_credits" between 0 and 9007199254740991),
	CONSTRAINT "copy_state" CHECK (("wb_next"."marketing_copy_jobs"."status" = 'accepted' and "wb_next"."marketing_copy_jobs"."result" is null and "wb_next"."marketing_copy_jobs"."failure_code" is null and "wb_next"."marketing_copy_jobs"."finished_at" is null) or ("wb_next"."marketing_copy_jobs"."status" = 'succeeded' and "wb_next"."marketing_copy_jobs"."result" is not null and "wb_next"."marketing_copy_jobs"."failure_code" is null and "wb_next"."marketing_copy_jobs"."finished_at" is not null) or ("wb_next"."marketing_copy_jobs"."status" = 'failed' and "wb_next"."marketing_copy_jobs"."result" is null and "wb_next"."marketing_copy_jobs"."failure_code" is not null and "wb_next"."marketing_copy_jobs"."finished_at" is not null)),
	CONSTRAINT "copy_billing" CHECK (("wb_next"."marketing_copy_jobs"."binding" is null and "wb_next"."marketing_copy_jobs"."reserved_credits" = 0 and "wb_next"."marketing_copy_jobs"."billing_state" = 'none') or ("wb_next"."marketing_copy_jobs"."binding" is not null and "wb_next"."marketing_copy_jobs"."reserved_credits" > 0 and ("wb_next"."marketing_copy_jobs"."status" = 'accepted' and "wb_next"."marketing_copy_jobs"."billing_state" = 'held' or "wb_next"."marketing_copy_jobs"."status" = 'succeeded' and "wb_next"."marketing_copy_jobs"."billing_state" = 'settled' or "wb_next"."marketing_copy_jobs"."status" = 'failed' and "wb_next"."marketing_copy_jobs"."billing_state" = 'refunded'))),
	CONSTRAINT "copy_submission" CHECK (("wb_next"."marketing_copy_jobs"."submission_state" is null and "wb_next"."marketing_copy_jobs"."token" is null and "wb_next"."marketing_copy_jobs"."request" is null and "wb_next"."marketing_copy_jobs"."submitted_at" is null) or ("wb_next"."marketing_copy_jobs"."binding" is not null and "wb_next"."marketing_copy_jobs"."token" is not null and "wb_next"."marketing_copy_jobs"."request" is not null and "wb_next"."marketing_copy_jobs"."submitted_at" is not null and ("wb_next"."marketing_copy_jobs"."submission_state" in ('submitting', 'unknown') and "wb_next"."marketing_copy_jobs"."status" = 'accepted' and "wb_next"."marketing_copy_jobs"."response" is null or "wb_next"."marketing_copy_jobs"."submission_state" = 'received' and "wb_next"."marketing_copy_jobs"."response" is not null or "wb_next"."marketing_copy_jobs"."submission_state" = 'rejected' and "wb_next"."marketing_copy_jobs"."status" = 'failed' and "wb_next"."marketing_copy_jobs"."response" is null)))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."marketing_copy_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "copy_outbox_scope" CHECK ("wb_next"."marketing_copy_outbox"."type" in ('requested', 'resume') and "wb_next"."marketing_copy_outbox"."workflow_id" = 'marketing-copy:' || "wb_next"."marketing_copy_outbox"."job_id"::text and "wb_next"."marketing_copy_outbox"."attempts" >= 0),
	CONSTRAINT "copy_outbox_state" CHECK (("wb_next"."marketing_copy_outbox"."status" = 'pending' and "wb_next"."marketing_copy_outbox"."lease_token" is null and "wb_next"."marketing_copy_outbox"."lease_until" is null and "wb_next"."marketing_copy_outbox"."delivered_at" is null) or ("wb_next"."marketing_copy_outbox"."status" = 'leased' and "wb_next"."marketing_copy_outbox"."lease_token" is not null and "wb_next"."marketing_copy_outbox"."lease_until" is not null and "wb_next"."marketing_copy_outbox"."delivered_at" is null) or ("wb_next"."marketing_copy_outbox"."status" = 'delivered' and "wb_next"."marketing_copy_outbox"."lease_token" is null and "wb_next"."marketing_copy_outbox"."lease_until" is null and "wb_next"."marketing_copy_outbox"."delivered_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."marketing_copy_reviews" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"request_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"prior_state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copy_review_action" CHECK ("wb_next"."marketing_copy_reviews"."action" in ('receipt', 'reject') and "wb_next"."marketing_copy_reviews"."request_hash" ~ '^[a-f0-9]{64}$' and length("wb_next"."marketing_copy_reviews"."reason") between 1 and 500 and length("wb_next"."marketing_copy_reviews"."evidence_reference") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "wb_next"."generation_jobs" ADD COLUMN "copy_job_id" uuid;--> statement-breakpoint
ALTER TABLE "wb_next"."marketing_copy_jobs" ADD CONSTRAINT "marketing_copy_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."marketing_copy_outbox" ADD CONSTRAINT "marketing_copy_outbox_job_id_marketing_copy_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."marketing_copy_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."marketing_copy_reviews" ADD CONSTRAINT "marketing_copy_reviews_job_id_marketing_copy_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."marketing_copy_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "copy_request_uq" ON "wb_next"."marketing_copy_jobs" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "copy_active_category_uq" ON "wb_next"."marketing_copy_jobs" USING btree ("user_id","category") WHERE "wb_next"."marketing_copy_jobs"."status" = 'accepted';--> statement-breakpoint
CREATE UNIQUE INDEX "copy_outbox_kind_uq" ON "wb_next"."marketing_copy_outbox" USING btree ("job_id","type");--> statement-breakpoint
ALTER TABLE "wb_next"."generation_jobs" ADD CONSTRAINT "generation_jobs_copy_job_id_marketing_copy_jobs_id_fk" FOREIGN KEY ("copy_job_id") REFERENCES "wb_next"."marketing_copy_jobs"("id") ON DELETE no action ON UPDATE no action;
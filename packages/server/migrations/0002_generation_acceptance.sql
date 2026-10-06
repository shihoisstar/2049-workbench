CREATE TABLE "wb_next"."generation_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"request_key" text NOT NULL,
	"billing_key" text NOT NULL,
	"prompt" text NOT NULL,
	"resolution" text NOT NULL,
	"aspect_ratio" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"reserved_credits" bigint NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"output_ref" text,
	"actual_credits" bigint,
	"actual_cost_cents" bigint,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_request_key" CHECK (length(btrim("wb_next"."generation_jobs"."request_key")) between 1 and 200 and length("wb_next"."generation_jobs"."request_key") <= 200),
	CONSTRAINT "generation_input" CHECK (length(btrim("wb_next"."generation_jobs"."prompt")) between 1 and 3000 and length("wb_next"."generation_jobs"."prompt") <= 3000 and "wb_next"."generation_jobs"."resolution" in ('480p', '720p') and "wb_next"."generation_jobs"."aspect_ratio" in ('9:16', '16:9', '1:1') and "wb_next"."generation_jobs"."duration_sec" = 5),
	CONSTRAINT "generation_amounts" CHECK ("wb_next"."generation_jobs"."reserved_credits" between 1 and 9007199254740991 and ("wb_next"."generation_jobs"."actual_cost_cents" is null or "wb_next"."generation_jobs"."actual_cost_cents" between 0 and 9007199254740991)),
	CONSTRAINT "generation_state" CHECK (("wb_next"."generation_jobs"."status" = 'accepted' and "wb_next"."generation_jobs"."output_ref" is null and "wb_next"."generation_jobs"."actual_credits" is null and "wb_next"."generation_jobs"."actual_cost_cents" is null and "wb_next"."generation_jobs"."failure_code" is null and "wb_next"."generation_jobs"."finished_at" is null) or ("wb_next"."generation_jobs"."status" = 'succeeded' and "wb_next"."generation_jobs"."output_ref" is not null and length("wb_next"."generation_jobs"."output_ref") between 1 and 500 and "wb_next"."generation_jobs"."actual_credits" is not null and "wb_next"."generation_jobs"."actual_credits" between 0 and "wb_next"."generation_jobs"."reserved_credits" and "wb_next"."generation_jobs"."failure_code" is null and "wb_next"."generation_jobs"."finished_at" is not null) or ("wb_next"."generation_jobs"."status" = 'failed' and "wb_next"."generation_jobs"."failure_code" is not null and length("wb_next"."generation_jobs"."failure_code") between 1 and 200 and "wb_next"."generation_jobs"."output_ref" is null and "wb_next"."generation_jobs"."actual_credits" is null and "wb_next"."generation_jobs"."actual_cost_cents" is null and "wb_next"."generation_jobs"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text DEFAULT 'generation.requested' NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "outbox_event" CHECK ("wb_next"."outbox"."type" = 'generation.requested' and "wb_next"."outbox"."workflow_id" = 'generation:' || "wb_next"."outbox"."job_id"::text and "wb_next"."outbox"."attempts" >= 0),
	CONSTRAINT "outbox_state" CHECK (("wb_next"."outbox"."status" = 'pending' and "wb_next"."outbox"."lease_token" is null and "wb_next"."outbox"."lease_until" is null and "wb_next"."outbox"."delivered_at" is null) or ("wb_next"."outbox"."status" = 'leased' and "wb_next"."outbox"."lease_token" is not null and "wb_next"."outbox"."lease_until" is not null and "wb_next"."outbox"."delivered_at" is null) or ("wb_next"."outbox"."status" = 'delivered' and "wb_next"."outbox"."lease_token" is null and "wb_next"."outbox"."lease_until" is null and "wb_next"."outbox"."delivered_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_billing_key_reservations_user_id_billing_key_fk" FOREIGN KEY ("user_id","billing_key") REFERENCES "wb_next"."reservations"("user_id","billing_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."outbox" ADD CONSTRAINT "outbox_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_request_uq" ON "wb_next"."generation_jobs" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_billing_uq" ON "wb_next"."generation_jobs" USING btree ("user_id","billing_key");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_job_uq" ON "wb_next"."outbox" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_workflow_uq" ON "wb_next"."outbox" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "outbox_claim_idx" ON "wb_next"."outbox" USING btree ("status","available_at");
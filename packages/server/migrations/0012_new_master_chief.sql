CREATE TABLE "wb_next"."drama_export_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text DEFAULT 'drama_export.requested' NOT NULL,
	"workflow_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "drama_export_outbox_event" CHECK ("wb_next"."drama_export_outbox"."type" in ('drama_export.requested', 'drama_export.resume') and "wb_next"."drama_export_outbox"."workflow_id" = 'drama-export:' || "wb_next"."drama_export_outbox"."job_id"::text and "wb_next"."drama_export_outbox"."attempts" >= 0),
	CONSTRAINT "drama_export_outbox_state" CHECK (("wb_next"."drama_export_outbox"."status" = 'pending' and "wb_next"."drama_export_outbox"."lease_token" is null and "wb_next"."drama_export_outbox"."lease_until" is null and "wb_next"."drama_export_outbox"."delivered_at" is null) or ("wb_next"."drama_export_outbox"."status" = 'leased' and "wb_next"."drama_export_outbox"."lease_token" is not null and "wb_next"."drama_export_outbox"."lease_until" is not null and "wb_next"."drama_export_outbox"."delivered_at" is null) or ("wb_next"."drama_export_outbox"."status" = 'delivered' and "wb_next"."drama_export_outbox"."lease_token" is null and "wb_next"."drama_export_outbox"."lease_until" is null and "wb_next"."drama_export_outbox"."delivered_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_export_outbox" ADD CONSTRAINT "drama_export_outbox_job_id_drama_export_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."drama_export_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_export_outbox_request_uq" ON "wb_next"."drama_export_outbox" USING btree ("job_id") WHERE "wb_next"."drama_export_outbox"."type" = 'drama_export.requested';--> statement-breakpoint
CREATE UNIQUE INDEX "drama_export_outbox_resume_uq" ON "wb_next"."drama_export_outbox" USING btree ("job_id") WHERE "wb_next"."drama_export_outbox"."type" = 'drama_export.resume';--> statement-breakpoint
CREATE INDEX "drama_export_outbox_claim_idx" ON "wb_next"."drama_export_outbox" USING btree ("status","available_at");
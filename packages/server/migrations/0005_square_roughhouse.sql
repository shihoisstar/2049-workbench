CREATE TABLE "wb_next"."generation_job_materials" (
	"job_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "generation_job_materials_job_id_material_id_pk" PRIMARY KEY("job_id","material_id"),
	CONSTRAINT "job_material_position" CHECK ("wb_next"."generation_job_materials"."position" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "wb_next"."user_materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" integer NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "material_hash" CHECK ("wb_next"."user_materials"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "material_size" CHECK ("wb_next"."user_materials"."byte_length" between 1 and 10485760 and "wb_next"."user_materials"."width" between 1 and 8192 and "wb_next"."user_materials"."height" between 1 and 8192),
	CONSTRAINT "material_type_key" CHECK (("wb_next"."user_materials"."content_type" = 'image/jpeg' and "wb_next"."user_materials"."object_key" ~ '^materials/[a-f0-9-]{36}/[a-f0-9]{64}\.jpg$')
    or ("wb_next"."user_materials"."content_type" = 'image/png' and "wb_next"."user_materials"."object_key" ~ '^materials/[a-f0-9-]{36}/[a-f0-9]{64}\.png$')
    or ("wb_next"."user_materials"."content_type" = 'image/webp' and "wb_next"."user_materials"."object_key" ~ '^materials/[a-f0-9-]{36}/[a-f0-9]{64}\.webp$')),
	CONSTRAINT "material_state" CHECK (("wb_next"."user_materials"."status" = 'active' and "wb_next"."user_materials"."expires_at" > "wb_next"."user_materials"."created_at") or ("wb_next"."user_materials"."status" = 'expired'))
);
--> statement-breakpoint
ALTER TABLE "wb_next"."outbox" DROP CONSTRAINT "outbox_event";--> statement-breakpoint
DROP INDEX "wb_next"."outbox_job_uq";--> statement-breakpoint
DROP INDEX "wb_next"."outbox_workflow_uq";--> statement-breakpoint
ALTER TABLE "wb_next"."generation_job_materials" ADD CONSTRAINT "generation_job_materials_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "wb_next"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."generation_job_materials" ADD CONSTRAINT "generation_job_materials_material_id_user_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "wb_next"."user_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."user_materials" ADD CONSTRAINT "user_materials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_material_position_uq" ON "wb_next"."generation_job_materials" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "job_material_material_idx" ON "wb_next"."generation_job_materials" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_object_uq" ON "wb_next"."user_materials" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "material_user_idx" ON "wb_next"."user_materials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_request_uq" ON "wb_next"."outbox" USING btree ("job_id") WHERE "wb_next"."outbox"."type" = 'generation.requested';--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_resume_uq" ON "wb_next"."outbox" USING btree ("job_id") WHERE "wb_next"."outbox"."type" = 'generation.resume';--> statement-breakpoint
ALTER TABLE "wb_next"."outbox" ADD CONSTRAINT "outbox_event" CHECK ("wb_next"."outbox"."type" in ('generation.requested', 'generation.resume') and "wb_next"."outbox"."workflow_id" = 'generation:' || "wb_next"."outbox"."job_id"::text and "wb_next"."outbox"."attempts" >= 0);
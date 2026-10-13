CREATE TABLE "wb_next"."drama_storyboard_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"shots" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_storyboard_plan_fields" CHECK ("wb_next"."drama_storyboard_plans"."source_key" ~ '^[a-f0-9]{64}$' and "wb_next"."drama_storyboard_plans"."revision" >= 1 and jsonb_typeof("wb_next"."drama_storyboard_plans"."snapshot") = 'object' and jsonb_typeof("wb_next"."drama_storyboard_plans"."shots") = 'array')
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_plans" ADD CONSTRAINT "drama_storyboard_plans_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_plans" ADD CONSTRAINT "drama_storyboard_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_storyboard_plan_source_uq" ON "wb_next"."drama_storyboard_plans" USING btree ("project_id","source_key");--> statement-breakpoint
CREATE INDEX "drama_storyboard_plan_project_idx" ON "wb_next"."drama_storyboard_plans" USING btree ("user_id","project_id","created_at");
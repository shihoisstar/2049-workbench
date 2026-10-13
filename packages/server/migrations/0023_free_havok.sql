CREATE TABLE "wb_next"."drama_plan_candidate_roles" (
	"candidate_id" uuid NOT NULL,
	"role_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "drama_plan_candidate_position" CHECK ("wb_next"."drama_plan_candidate_roles"."position" >= 0 and "wb_next"."drama_plan_candidate_roles"."position" < 10)
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_shots" DROP CONSTRAINT "drama_storyboard_shots_ordinal";--> statement-breakpoint
DROP INDEX "wb_next"."drama_storyboard_shots_project_scene_uq";--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ALTER COLUMN "role_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ALTER COLUMN "scene_version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD COLUMN "plan_revision" integer;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD COLUMN "quote_version" text;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD COLUMN "scene_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_shots" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_shots" ADD COLUMN "shot_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_plan_candidate_roles" ADD CONSTRAINT "drama_plan_candidate_roles_candidate_id_drama_storyboard_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "wb_next"."drama_storyboard_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_plan_candidate_roles" ADD CONSTRAINT "drama_plan_candidate_roles_role_version_id_drama_role_versions_id_fk" FOREIGN KEY ("role_version_id") REFERENCES "wb_next"."drama_role_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_plan_candidate_role_uq" ON "wb_next"."drama_plan_candidate_roles" USING btree ("candidate_id","role_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_plan_candidate_position_uq" ON "wb_next"."drama_plan_candidate_roles" USING btree ("candidate_id","position");--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_shots" ADD CONSTRAINT "drama_storyboard_shots_plan_id_drama_storyboard_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "wb_next"."drama_storyboard_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_storyboard_shots_plan_order_uq" ON "wb_next"."drama_storyboard_shots" USING btree ("plan_id","episode_number","scene_number","shot_number") WHERE "wb_next"."drama_storyboard_shots"."plan_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_storyboard_shots_project_scene_uq" ON "wb_next"."drama_storyboard_shots" USING btree ("project_id","episode_number","scene_number") WHERE "wb_next"."drama_storyboard_shots"."plan_id" is null;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD CONSTRAINT "drama_storyboard_candidates_source" CHECK ((("wb_next"."drama_storyboard_candidates"."source_key" is null and "wb_next"."drama_storyboard_candidates"."plan_revision" is null and "wb_next"."drama_storyboard_candidates"."quote_version" is null and "wb_next"."drama_storyboard_candidates"."role_version_id" is not null and "wb_next"."drama_storyboard_candidates"."scene_version_id" is not null and "wb_next"."drama_storyboard_candidates"."scene_snapshot" is null) or ("wb_next"."drama_storyboard_candidates"."source_key" ~ '^[a-f0-9]{64}$' and "wb_next"."drama_storyboard_candidates"."plan_revision" >= 1 and length("wb_next"."drama_storyboard_candidates"."quote_version") between 1 and 100 and "wb_next"."drama_storyboard_candidates"."role_version_id" is null and "wb_next"."drama_storyboard_candidates"."scene_version_id" is null and jsonb_typeof("wb_next"."drama_storyboard_candidates"."scene_snapshot") = 'object')) is true);--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_shots" ADD CONSTRAINT "drama_storyboard_shots_ordinal" CHECK ("wb_next"."drama_storyboard_shots"."episode_number" >= 1 and "wb_next"."drama_storyboard_shots"."scene_number" >= 1 and "wb_next"."drama_storyboard_shots"."shot_number" >= 1);
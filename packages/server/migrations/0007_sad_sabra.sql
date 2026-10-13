CREATE TABLE "wb_next"."drama_role_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"description" text NOT NULL,
	"reference_material_id" uuid NOT NULL,
	"reference_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_role_versions_description" CHECK (length(btrim("wb_next"."drama_role_versions"."description")) between 1 and 2000 and length("wb_next"."drama_role_versions"."description") <= 2000),
	CONSTRAINT "drama_role_versions_reference_hash" CHECK ("wb_next"."drama_role_versions"."reference_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "drama_role_versions_ordinal" CHECK ("wb_next"."drama_role_versions"."ordinal" >= 1)
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_roles_name" CHECK (length(btrim("wb_next"."drama_roles"."name")) between 1 and 100 and length("wb_next"."drama_roles"."name") <= 100)
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_scene_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scene_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_scene_versions_description" CHECK (length(btrim("wb_next"."drama_scene_versions"."description")) between 1 and 2000 and length("wb_next"."drama_scene_versions"."description") <= 2000),
	CONSTRAINT "drama_scene_versions_ordinal" CHECK ("wb_next"."drama_scene_versions"."ordinal" >= 1)
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_scenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_scenes_name" CHECK (length(btrim("wb_next"."drama_scenes"."name")) between 1 and 100 and length("wb_next"."drama_scenes"."name") <= 100)
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_storyboard_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shot_id" uuid NOT NULL,
	"script_version_id" uuid NOT NULL,
	"role_version_id" uuid NOT NULL,
	"scene_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"prompt" text NOT NULL,
	"selected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_storyboard_candidates_ordinal" CHECK ("wb_next"."drama_storyboard_candidates"."ordinal" >= 1),
	CONSTRAINT "drama_storyboard_candidates_prompt" CHECK (length(btrim("wb_next"."drama_storyboard_candidates"."prompt")) between 1 and 3000 and length("wb_next"."drama_storyboard_candidates"."prompt") <= 3000)
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_storyboard_shots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"episode_number" integer NOT NULL,
	"scene_number" integer NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_storyboard_shots_ordinal" CHECK ("wb_next"."drama_storyboard_shots"."episode_number" >= 1 and "wb_next"."drama_storyboard_shots"."scene_number" >= 1),
	CONSTRAINT "drama_storyboard_shots_prompt" CHECK (length(btrim("wb_next"."drama_storyboard_shots"."prompt")) between 1 and 3000 and length("wb_next"."drama_storyboard_shots"."prompt") <= 3000)
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_role_versions" ADD CONSTRAINT "drama_role_versions_role_id_drama_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "wb_next"."drama_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_role_versions" ADD CONSTRAINT "drama_role_versions_reference_material_id_user_materials_id_fk" FOREIGN KEY ("reference_material_id") REFERENCES "wb_next"."user_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_roles" ADD CONSTRAINT "drama_roles_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_roles" ADD CONSTRAINT "drama_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_scene_versions" ADD CONSTRAINT "drama_scene_versions_scene_id_drama_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "wb_next"."drama_scenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_scenes" ADD CONSTRAINT "drama_scenes_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_scenes" ADD CONSTRAINT "drama_scenes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD CONSTRAINT "drama_storyboard_candidates_shot_id_drama_storyboard_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "wb_next"."drama_storyboard_shots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD CONSTRAINT "drama_storyboard_candidates_script_version_id_drama_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "wb_next"."drama_script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD CONSTRAINT "drama_storyboard_candidates_role_version_id_drama_role_versions_id_fk" FOREIGN KEY ("role_version_id") REFERENCES "wb_next"."drama_role_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_candidates" ADD CONSTRAINT "drama_storyboard_candidates_scene_version_id_drama_scene_versions_id_fk" FOREIGN KEY ("scene_version_id") REFERENCES "wb_next"."drama_scene_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_shots" ADD CONSTRAINT "drama_storyboard_shots_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_storyboard_shots" ADD CONSTRAINT "drama_storyboard_shots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drama_role_versions_ordinal_uq" ON "wb_next"."drama_role_versions" USING btree ("role_id","ordinal");--> statement-breakpoint
CREATE INDEX "drama_role_versions_role_idx" ON "wb_next"."drama_role_versions" USING btree ("role_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_roles_project_name_uq" ON "wb_next"."drama_roles" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "drama_roles_user_project_idx" ON "wb_next"."drama_roles" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_scene_versions_ordinal_uq" ON "wb_next"."drama_scene_versions" USING btree ("scene_id","ordinal");--> statement-breakpoint
CREATE INDEX "drama_scene_versions_scene_idx" ON "wb_next"."drama_scene_versions" USING btree ("scene_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_scenes_project_name_uq" ON "wb_next"."drama_scenes" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "drama_scenes_user_project_idx" ON "wb_next"."drama_scenes" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_storyboard_candidates_ordinal_uq" ON "wb_next"."drama_storyboard_candidates" USING btree ("shot_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_storyboard_candidates_selected_uq" ON "wb_next"."drama_storyboard_candidates" USING btree ("shot_id") WHERE "wb_next"."drama_storyboard_candidates"."selected_at" is not null;--> statement-breakpoint
CREATE INDEX "drama_storyboard_candidates_shot_idx" ON "wb_next"."drama_storyboard_candidates" USING btree ("shot_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_storyboard_shots_project_scene_uq" ON "wb_next"."drama_storyboard_shots" USING btree ("project_id","episode_number","scene_number");--> statement-breakpoint
CREATE INDEX "drama_storyboard_shots_user_project_idx" ON "wb_next"."drama_storyboard_shots" USING btree ("user_id","project_id");
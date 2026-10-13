CREATE TABLE "wb_next"."drama_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"script_id" uuid,
	"active_version_id" uuid,
	"mode" text NOT NULL,
	"title" text NOT NULL,
	"idea" text,
	"look" text NOT NULL,
	"aspect_ratio" text NOT NULL,
	"episode_count" integer NOT NULL,
	"genre" text,
	"tone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_project_mode" CHECK ("wb_next"."drama_projects"."mode" in ('idea', 'script')),
	CONSTRAINT "drama_project_title" CHECK (length(btrim("wb_next"."drama_projects"."title")) between 1 and 30 and length("wb_next"."drama_projects"."title") <= 30),
	CONSTRAINT "drama_project_look" CHECK ("wb_next"."drama_projects"."look" in ('3D国创', '都市言情', '美式3D', '都市漫画')),
	CONSTRAINT "drama_project_ratio" CHECK ("wb_next"."drama_projects"."aspect_ratio" in ('4:3', '3:4', '16:9', '9:16')),
	CONSTRAINT "drama_project_episodes" CHECK ("wb_next"."drama_projects"."episode_count" between 1 and 40),
	CONSTRAINT "drama_project_mode_data" CHECK (("wb_next"."drama_projects"."mode" = 'idea' and length(btrim("wb_next"."drama_projects"."idea")) between 1 and 1000 and "wb_next"."drama_projects"."script_id" is null and "wb_next"."drama_projects"."active_version_id" is null and "wb_next"."drama_projects"."genre" in ('通用', '动作', '玄幻', '言情', '悬疑', '古装', '现代', '穿越', '重生', '都市', '宫斗', '喜剧', '科幻', '校园', '青春') and "wb_next"."drama_projects"."tone" in ('通用', '严肃', '搞笑', '讽刺', '稳重', '简洁')) or ("wb_next"."drama_projects"."mode" = 'script' and "wb_next"."drama_projects"."idea" is null and "wb_next"."drama_projects"."script_id" is not null and "wb_next"."drama_projects"."active_version_id" is not null and "wb_next"."drama_projects"."genre" is null and "wb_next"."drama_projects"."tone" is null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_script_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"script_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"source" text NOT NULL,
	"parse_status" text NOT NULL,
	"parsed_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_script_version_content" CHECK (length(btrim("wb_next"."drama_script_versions"."content")) between 1 and 20000 and length("wb_next"."drama_script_versions"."content") <= 20000),
	CONSTRAINT "drama_script_version_source" CHECK ("wb_next"."drama_script_versions"."source" in ('imported', 'manual_repair')),
	CONSTRAINT "drama_script_version_parse" CHECK ("wb_next"."drama_script_versions"."parse_status" in ('parsed', 'needs_repair')),
	CONSTRAINT "drama_script_version_ordinal" CHECK ("wb_next"."drama_script_versions"."ordinal" >= 1)
);
--> statement-breakpoint
CREATE TABLE "wb_next"."drama_scripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_scripts_title" CHECK (length(btrim("wb_next"."drama_scripts"."title")) between 1 and 30 and length("wb_next"."drama_scripts"."title") <= 30)
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD CONSTRAINT "drama_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_projects" ADD CONSTRAINT "drama_projects_script_id_drama_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "wb_next"."drama_scripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_script_versions" ADD CONSTRAINT "drama_script_versions_script_id_drama_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "wb_next"."drama_scripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_scripts" ADD CONSTRAINT "drama_scripts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drama_projects_user_created_idx" ON "wb_next"."drama_projects" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "drama_projects_script_idx" ON "wb_next"."drama_projects" USING btree ("script_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drama_script_version_ordinal_uq" ON "wb_next"."drama_script_versions" USING btree ("script_id","ordinal");--> statement-breakpoint
CREATE INDEX "drama_script_versions_script_idx" ON "wb_next"."drama_script_versions" USING btree ("script_id","ordinal");--> statement-breakpoint
CREATE INDEX "drama_scripts_user_created_idx" ON "wb_next"."drama_scripts" USING btree ("user_id","created_at","id");
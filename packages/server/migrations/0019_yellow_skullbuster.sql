CREATE TABLE "wb_next"."drama_role_selections" (
	"project_id" uuid NOT NULL,
	"role_key" text NOT NULL,
	"script_version_id" uuid NOT NULL,
	"role_version_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drama_role_selections_project_id_role_key_pk" PRIMARY KEY("project_id","role_key"),
	CONSTRAINT "drama_role_selection_fields" CHECK (length(btrim("wb_next"."drama_role_selections"."role_key")) between 1 and 100 and "wb_next"."drama_role_selections"."fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "wb_next"."drama_role_selections" ADD CONSTRAINT "drama_role_selections_project_id_drama_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "wb_next"."drama_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_role_selections" ADD CONSTRAINT "drama_role_selections_script_version_id_drama_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "wb_next"."drama_script_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."drama_role_selections" ADD CONSTRAINT "drama_role_selections_role_version_id_drama_role_versions_id_fk" FOREIGN KEY ("role_version_id") REFERENCES "wb_next"."drama_role_versions"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "generation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"billing_key" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"prompt" text NOT NULL,
	"resolution" text DEFAULT '480p' NOT NULL,
	"duration_sec" integer DEFAULT 5 NOT NULL,
	"model" text NOT NULL,
	"estimate_credits" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_name" text,
	"provider_task_id" text,
	"channel_id" integer,
	"video_url" text,
	"error_code" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_tasks_billing_key_unique" UNIQUE("billing_key")
);
--> statement-breakpoint
ALTER TABLE "generation_tasks" ADD CONSTRAINT "generation_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
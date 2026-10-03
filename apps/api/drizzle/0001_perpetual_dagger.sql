CREATE TABLE "credit_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"credits" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"package_id" text NOT NULL,
	"credits" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"transaction_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_package_id_credit_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."credit_packages"("id") ON DELETE no action ON UPDATE no action;-- seed:充值档位(定价 placeholder,随 BIZ-01/02 成本推演校准);幂等
INSERT INTO "credit_packages" ("id","label","credits","price_cents","active","sort_order")
VALUES
  ('pkg-60','体验档 · 60 积分',60,600,true,1),
  ('pkg-300','标准档 · 300 积分',300,3000,true,2),
  ('pkg-980','超值档 · 980 积分',980,9800,true,3)
ON CONFLICT ("id") DO NOTHING;

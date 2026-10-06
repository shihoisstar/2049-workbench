CREATE SCHEMA "wb_next";
--> statement-breakpoint
CREATE TABLE "wb_next"."ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"billing_key" text NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"remark" text,
	"reservation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_key" CHECK (length(btrim("wb_next"."ledger"."billing_key")) between 1 and 200 and length("wb_next"."ledger"."billing_key") <= 200),
	CONSTRAINT "ledger_amount_range" CHECK ("wb_next"."ledger"."amount" between -9007199254740991 and 9007199254740991),
	CONSTRAINT "ledger_kind_amount" CHECK (("wb_next"."ledger"."kind" = 'grant' and "wb_next"."ledger"."amount" > 0) or ("wb_next"."ledger"."kind" = 'hold' and "wb_next"."ledger"."amount" < 0) or ("wb_next"."ledger"."kind" = 'settle' and "wb_next"."ledger"."amount" >= 0) or ("wb_next"."ledger"."kind" = 'refund' and "wb_next"."ledger"."amount" > 0)),
	CONSTRAINT "ledger_reservation" CHECK (("wb_next"."ledger"."kind" = 'grant' and "wb_next"."ledger"."reservation_key" is null) or ("wb_next"."ledger"."kind" <> 'grant' and "wb_next"."ledger"."reservation_key" is not null and "wb_next"."ledger"."reservation_key" = "wb_next"."ledger"."billing_key"))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."reservations" (
	"user_id" uuid NOT NULL,
	"billing_key" text NOT NULL,
	"estimate" bigint NOT NULL,
	"model" text NOT NULL,
	"estimated_cost_cents" bigint NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"actual" bigint,
	"actual_cost_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "reservations_user_id_billing_key_pk" PRIMARY KEY("user_id","billing_key"),
	CONSTRAINT "reservation_key" CHECK (length(btrim("wb_next"."reservations"."billing_key")) between 1 and 200 and length("wb_next"."reservations"."billing_key") <= 200),
	CONSTRAINT "reservation_model" CHECK (length(btrim("wb_next"."reservations"."model")) between 1 and 200 and length("wb_next"."reservations"."model") <= 200),
	CONSTRAINT "reservation_amounts" CHECK ("wb_next"."reservations"."estimate" between 1 and 9007199254740991 and "wb_next"."reservations"."estimated_cost_cents" between 0 and 9007199254740991 and ("wb_next"."reservations"."actual_cost_cents" is null or "wb_next"."reservations"."actual_cost_cents" between 0 and 9007199254740991)),
	CONSTRAINT "reservation_state" CHECK (("wb_next"."reservations"."status" = 'held' and "wb_next"."reservations"."actual" is null and "wb_next"."reservations"."finished_at" is null) or ("wb_next"."reservations"."status" = 'settled' and "wb_next"."reservations"."actual" is not null and "wb_next"."reservations"."actual" between 0 and "wb_next"."reservations"."estimate" and "wb_next"."reservations"."finished_at" is not null) or ("wb_next"."reservations"."status" = 'refunded' and "wb_next"."reservations"."actual" is null and "wb_next"."reservations"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_hash" CHECK ("wb_next"."sessions"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "wb_next"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"credential_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "users_credential_hash_unique" UNIQUE("credential_hash"),
	CONSTRAINT "users_hash" CHECK ("wb_next"."users"."credential_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "users_status" CHECK (("wb_next"."users"."status" = 'active' and "wb_next"."users"."deactivated_at" is null) or ("wb_next"."users"."status" = 'deactivated' and "wb_next"."users"."deactivated_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "wb_next"."wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_balance_range" CHECK ("wb_next"."wallets"."balance" between 0 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "wb_next"."ledger" ADD CONSTRAINT "ledger_user_id_wallets_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."wallets"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."ledger" ADD CONSTRAINT "ledger_user_id_reservation_key_reservations_user_id_billing_key_fk" FOREIGN KEY ("user_id","reservation_key") REFERENCES "wb_next"."reservations"("user_id","billing_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."reservations" ADD CONSTRAINT "reservations_user_id_wallets_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."wallets"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wb_next"."wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "wb_next"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_operation_uq" ON "wb_next"."ledger" USING btree ("user_id","billing_key","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_terminal_uq" ON "wb_next"."ledger" USING btree ("user_id","billing_key") WHERE "wb_next"."ledger"."kind" in ('settle', 'refund');--> statement-breakpoint
CREATE INDEX "ledger_user_history_idx" ON "wb_next"."ledger" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "wb_next"."sessions" USING btree ("user_id");
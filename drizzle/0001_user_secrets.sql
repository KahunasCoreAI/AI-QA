CREATE TABLE IF NOT EXISTS "user_secrets" (
  "user_id" text PRIMARY KEY NOT NULL,
  "linear_api_key_encrypted" text,
  "linear_default_team_id" text,
  "linear_default_team_name" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "user_secrets"
    ADD CONSTRAINT "user_secrets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

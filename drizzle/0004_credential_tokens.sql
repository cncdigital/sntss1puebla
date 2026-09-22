ALTER TABLE applications ADD COLUMN credential_token TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS applications_credential_token_unique ON applications (credential_token);

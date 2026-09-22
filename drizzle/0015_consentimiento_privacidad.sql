CREATE TABLE `application_consents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`worker_id` integer NOT NULL,
	`matricula` text NOT NULL,
	`notice_version` text NOT NULL,
	`terms_version` text NOT NULL,
	`privacy_accepted` integer DEFAULT false NOT NULL,
	`identification_documents_accepted` integer DEFAULT false NOT NULL,
	`general_terms_accepted` integer DEFAULT false NOT NULL,
	`beneficiary_authority_confirmed` integer DEFAULT false NOT NULL,
	`acceptance_channel` text DEFAULT 'web_credential_registration' NOT NULL,
	`accepted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_consents_application_versions_unique` ON `application_consents` (`application_id`,`notice_version`,`terms_version`);--> statement-breakpoint
CREATE INDEX `application_consents_worker_accepted_idx` ON `application_consents` (`worker_id`,`accepted_at`);
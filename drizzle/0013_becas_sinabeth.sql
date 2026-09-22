CREATE TABLE `scholarship_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`season` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_campaigns_identity_unique` ON `scholarship_campaigns` (`name`,`year`,`season`);--> statement-breakpoint
CREATE INDEX `scholarship_campaigns_active_year_idx` ON `scholarship_campaigns` (`active`,`year`);--> statement-breakpoint
CREATE TABLE `scholarship_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` integer NOT NULL,
	`application_id` integer NOT NULL,
	`credential_token` text NOT NULL,
	`folio` text NOT NULL,
	`level` text NOT NULL,
	`level_sequence` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`worker_name` text NOT NULL,
	`matricula` text NOT NULL,
	`adscription` text,
	`worker_curp` text,
	`rfc` text,
	`child_beneficiary_id` integer NOT NULL,
	`child_name` text NOT NULL,
	`child_curp` text NOT NULL,
	`grade_hundredths` integer NOT NULL,
	`reader_actor` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_entries_folio_unique` ON `scholarship_entries` (`folio`);--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_entries_campaign_level_sequence_unique` ON `scholarship_entries` (`campaign_id`,`level`,`level_sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_entries_campaign_worker_level_unique` ON `scholarship_entries` (`campaign_id`,`matricula`,`level`);--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_entries_campaign_child_curp_unique` ON `scholarship_entries` (`campaign_id`,`child_curp`);--> statement-breakpoint
CREATE INDEX `scholarship_entries_campaign_created_idx` ON `scholarship_entries` (`campaign_id`,`created_at`);

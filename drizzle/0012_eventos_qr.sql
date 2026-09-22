CREATE TABLE IF NOT EXISTS `worker_tax_ids` (
	`matricula` text PRIMARY KEY NOT NULL,
	`rfc` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`event_date` text,
	`location` text,
	`active` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `events_active_date_idx` ON `events` (`active`,`event_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `event_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`category` text NOT NULL,
	`normalized_category` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `event_categories_event_normalized_unique`
	ON `event_categories` (`event_id`,`normalized_category`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `event_categories_event_idx` ON `event_categories` (`event_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `event_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`credential_token` text NOT NULL,
	`full_name` text NOT NULL,
	`matricula` text NOT NULL,
	`category` text NOT NULL,
	`curp` text,
	`rfc` text,
	`nss` text,
	`companion` integer DEFAULT 0 NOT NULL,
	`companion_gender` text,
	`raffle_token` text NOT NULL,
	`reader_actor` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `event_entries_raffle_token_unique`
	ON `event_entries` (`raffle_token`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `event_entries_event_credential_unique`
	ON `event_entries` (`event_id`,`credential_token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `event_entries_event_created_idx`
	ON `event_entries` (`event_id`,`created_at`);

CREATE TABLE `access_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`credential_token` text NOT NULL,
	`facility` text NOT NULL,
	`movement` text NOT NULL,
	`reader_email` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`worker_id` integer NOT NULL,
	`folio` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `applications_folio_unique` ON `applications` (`folio`);--> statement-breakpoint
CREATE TABLE `beneficiaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`application_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`relationship` text NOT NULL,
	`credential_token` text,
	`active` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beneficiaries_credential_token_unique` ON `beneficiaries` (`credential_token`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`matricula` text NOT NULL,
	`full_name` text NOT NULL,
	`category` text,
	`unit` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_matricula_unique` ON `workers` (`matricula`);
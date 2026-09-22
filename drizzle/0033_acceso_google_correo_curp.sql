CREATE TABLE `worker_identity_access` (
	`matricula` text PRIMARY KEY NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_failed_at` text,
	`last_success_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `worker_identity_access_locked_idx` ON `worker_identity_access` (`locked_until`);

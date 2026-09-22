CREATE TABLE `devi_progress_coaching` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` integer NOT NULL,
	`list_id` integer NOT NULL,
	`list_title` text NOT NULL,
	`target_matricula` text NOT NULL,
	`process_type` text NOT NULL,
	`queue_label` text NOT NULL,
	`automatic_position` integer,
	`suggested_position` integer NOT NULL,
	`search_recommendation` text NOT NULL,
	`importance` text DEFAULT 'media' NOT NULL,
	`reference_label` text,
	`created_by` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `devi_progress_coaching_target_active_idx` ON `devi_progress_coaching` (`target_matricula`,`active`,`updated_at`);--> statement-breakpoint
CREATE INDEX `devi_progress_coaching_entry_active_idx` ON `devi_progress_coaching` (`entry_id`,`active`);--> statement-breakpoint
CREATE INDEX `devi_progress_coaching_list_active_idx` ON `devi_progress_coaching` (`list_id`,`active`);

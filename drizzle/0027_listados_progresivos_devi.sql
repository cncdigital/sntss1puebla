CREATE TABLE `devi_progress_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`process_type` text NOT NULL,
	`custom_process_label` text,
	`reference_label` text,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`storage_key` text NOT NULL,
	`content_sha256` text NOT NULL,
	`sheet_names_json` text DEFAULT '[]' NOT NULL,
	`row_count` integer NOT NULL,
	`skipped_rows` integer DEFAULT 0 NOT NULL,
	`uploaded_by` text NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devi_progress_lists_storage_key_unique` ON `devi_progress_lists` (`storage_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `devi_progress_lists_content_sha256_unique` ON `devi_progress_lists` (`content_sha256`);--> statement-breakpoint
CREATE INDEX `devi_progress_lists_active_updated_idx` ON `devi_progress_lists` (`active`,`updated_at`);--> statement-breakpoint
CREATE INDEX `devi_progress_lists_title_active_idx` ON `devi_progress_lists` (`normalized_title`,`active`);--> statement-breakpoint
CREATE INDEX `devi_progress_lists_process_active_idx` ON `devi_progress_lists` (`process_type`,`active`);--> statement-breakpoint
CREATE TABLE `devi_progress_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`progressive_number` text NOT NULL,
	`progressive_order` integer NOT NULL,
	`progressive_derived` integer DEFAULT false NOT NULL,
	`matricula` text NOT NULL,
	`normalized_name` text NOT NULL,
	`sheet_name` text NOT NULL,
	`row_number` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `devi_progress_lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devi_progress_entries_list_sheet_row_unique` ON `devi_progress_entries` (`list_id`,`sheet_name`,`row_number`);--> statement-breakpoint
CREATE INDEX `devi_progress_entries_matricula_list_idx` ON `devi_progress_entries` (`matricula`,`list_id`);--> statement-breakpoint
CREATE INDEX `devi_progress_entries_list_order_idx` ON `devi_progress_entries` (`list_id`,`progressive_order`);

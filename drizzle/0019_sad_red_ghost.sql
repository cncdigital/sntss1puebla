ALTER TABLE `devi_progress_entries` ADD `full_name` text;--> statement-breakpoint
ALTER TABLE `devi_progress_entries` ADD `unit_text` text;--> statement-breakpoint
ALTER TABLE `devi_progress_entries` ADD `status_text` text;--> statement-breakpoint
ALTER TABLE `devi_progress_entries` ADD `status_updated_at` text;--> statement-breakpoint
ALTER TABLE `devi_progress_entries` ADD `status_updated_by` text;--> statement-breakpoint
ALTER TABLE `role_assignments` ADD `can_manage_acts` integer DEFAULT false NOT NULL;
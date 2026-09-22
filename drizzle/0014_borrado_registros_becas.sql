DROP INDEX `scholarship_entries_campaign_worker_level_unique`;--> statement-breakpoint
DROP INDEX `scholarship_entries_campaign_child_curp_unique`;--> statement-breakpoint
ALTER TABLE `scholarship_entries` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `scholarship_entries` ADD `deleted_by` text;--> statement-breakpoint
ALTER TABLE `scholarship_entries` ADD `deletion_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_entries_campaign_worker_level_unique` ON `scholarship_entries` (`campaign_id`,`matricula`,`level`) WHERE "scholarship_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_entries_campaign_child_curp_unique` ON `scholarship_entries` (`campaign_id`,`child_curp`) WHERE "scholarship_entries"."deleted_at" IS NULL;

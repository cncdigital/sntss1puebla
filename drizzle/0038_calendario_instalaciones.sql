CREATE TABLE `facility_calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facility` text NOT NULL,
	`title` text NOT NULL,
	`organizer` text,
	`notes` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `facility_calendar_events_range_idx` ON `facility_calendar_events` (`facility`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `facility_calendar_events_starts_idx` ON `facility_calendar_events` (`starts_at`);--> statement-breakpoint
ALTER TABLE `role_assignments` ADD `can_view_facility_calendar` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `role_assignments` ADD `can_manage_sports_calendar` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `role_assignments` ADD `can_manage_union_calendar` integer DEFAULT false NOT NULL;

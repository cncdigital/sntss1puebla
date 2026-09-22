ALTER TABLE `applications` ADD `admin_validated` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `applications` ADD `admin_validated_by` text;
--> statement-breakpoint
ALTER TABLE `applications` ADD `admin_validated_at` text;

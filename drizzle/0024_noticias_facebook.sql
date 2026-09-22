CREATE TABLE `facebook_news` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`facebook_post_id` text NOT NULL,
	`page_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'INFORMACIÓN SINDICAL' NOT NULL,
	`permalink_url` text NOT NULL,
	`image_url` text,
	`published_at` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notify_eligible` integer DEFAULT true NOT NULL,
	`imported_via` text DEFAULT 'webhook' NOT NULL,
	`discovered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facebook_news_facebook_post_id_unique` ON `facebook_news` (`facebook_post_id`);--> statement-breakpoint
CREATE INDEX `facebook_news_active_published_idx` ON `facebook_news` (`active`,`published_at`);--> statement-breakpoint
CREATE INDEX `facebook_news_notify_discovered_idx` ON `facebook_news` (`notify_eligible`,`discovered_at`);--> statement-breakpoint
CREATE TABLE `facebook_news_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`last_error` text,
	`last_post_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

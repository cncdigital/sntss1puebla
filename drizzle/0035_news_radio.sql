CREATE TABLE `news_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`radio_stream_url` text DEFAULT 'http://78.129.252.13:26059/' NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

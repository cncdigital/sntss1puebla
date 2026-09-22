ALTER TABLE `role_assignments` ADD `can_train_devi` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `devi_training_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`kind` text NOT NULL,
	`reference_label` text,
	`summary` text NOT NULL,
	`original_name` text,
	`mime_type` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`storage_key` text UNIQUE,
	`content_sha256` text NOT NULL UNIQUE,
	`character_count` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `devi_training_sources_active_updated_idx` ON `devi_training_sources` (`active`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `devi_training_sources_kind_active_idx` ON `devi_training_sources` (`kind`,`active`);
--> statement-breakpoint
CREATE TABLE `devi_training_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`chunk_index` integer NOT NULL,
	`locator` text NOT NULL,
	`content` text NOT NULL,
	`normalized_content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `devi_training_sources`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devi_training_chunks_source_index_unique` ON `devi_training_chunks` (`source_id`,`chunk_index`);
--> statement-breakpoint
CREATE INDEX `devi_training_chunks_source_idx` ON `devi_training_chunks` (`source_id`);

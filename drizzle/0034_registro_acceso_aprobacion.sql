CREATE TABLE `worker_access_registration_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`registration_id` integer NOT NULL,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`storage_provider` text DEFAULT 'r2' NOT NULL,
	`drive_file_id` text,
	`drive_folder_id` text,
	`content_sha256` text,
	`file_name` text NOT NULL,
	`mime_type` text DEFAULT 'application/pdf' NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_access_registration_documents_storage_key_unique` ON `worker_access_registration_documents` (`storage_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `worker_access_registration_documents_kind_unique` ON `worker_access_registration_documents` (`registration_id`,`kind`);--> statement-breakpoint
CREATE INDEX `worker_access_registration_documents_registration_idx` ON `worker_access_registration_documents` (`registration_id`);--> statement-breakpoint
CREATE TABLE `worker_access_registrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`worker_id` integer NOT NULL,
	`application_id` integer NOT NULL,
	`email` text NOT NULL,
	`curp` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`submission_id` text NOT NULL,
	`review_notes` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`email_status` text DEFAULT 'pending' NOT NULL,
	`email_error` text,
	`email_sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worker_access_registrations_worker_id_unique` ON `worker_access_registrations` (`worker_id`);--> statement-breakpoint
CREATE INDEX `worker_access_registrations_status_idx` ON `worker_access_registrations` (`status`,`updated_at`);

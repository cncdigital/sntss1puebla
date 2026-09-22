CREATE TABLE `privileged_login_security` (
	`matricula` text PRIMARY KEY NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_failed_at` text,
	`last_success_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `privileged_login_security_locked_idx` ON `privileged_login_security` (`locked_until`);--> statement-breakpoint
CREATE TABLE `record_recovery` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`matricula` text,
	`snapshot_json` text NOT NULL,
	`reason` text NOT NULL,
	`archived_by` text NOT NULL,
	`archived_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`restore_until` text NOT NULL,
	`restored_by` text,
	`restored_at` text
);
--> statement-breakpoint
CREATE INDEX `record_recovery_active_until_idx` ON `record_recovery` (`restored_at`,`restore_until`);--> statement-breakpoint
CREATE INDEX `record_recovery_matricula_archived_idx` ON `record_recovery` (`matricula`,`archived_at`);--> statement-breakpoint
ALTER TABLE `applications` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `archived_by` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `archive_reason` text;--> statement-breakpoint
CREATE INDEX `applications_worker_active_idx` ON `applications` (`worker_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `applications_status_documents_idx` ON `applications` (`status`,`document_status`);--> statement-breakpoint
CREATE INDEX `verification_documents_application_status_idx` ON `verification_documents` (`application_id`,`verification_status`);--> statement-breakpoint
CREATE INDEX `verification_documents_beneficiary_idx` ON `verification_documents` (`beneficiary_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `beneficiaries_application_active_idx` ON `beneficiaries` (`application_id`,`active`);

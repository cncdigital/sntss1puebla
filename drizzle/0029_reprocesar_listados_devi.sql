DROP INDEX `devi_progress_lists_content_sha256_unique`;--> statement-breakpoint
CREATE INDEX `devi_progress_lists_content_sha256_idx` ON `devi_progress_lists` (`content_sha256`);

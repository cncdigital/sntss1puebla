ALTER TABLE `role_assignments` ADD `can_manage_scholarships` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `scholarship_manual_children` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`matricula` text NOT NULL,
	`full_name` text NOT NULL,
	`curp` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scholarship_manual_children_worker_curp_unique` ON `scholarship_manual_children` (`matricula`,`curp`);
--> statement-breakpoint
CREATE INDEX `scholarship_manual_children_worker_active_idx` ON `scholarship_manual_children` (`matricula`,`active`);

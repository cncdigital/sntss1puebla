CREATE TABLE `union_game_challenges` (
	`token` text PRIMARY KEY NOT NULL,
	`matricula` text NOT NULL,
	`question_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `union_game_challenges_player_active_idx` ON `union_game_challenges` (`matricula`,`completed_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `union_game_challenges_expires_idx` ON `union_game_challenges` (`expires_at`);--> statement-breakpoint
CREATE TABLE `union_game_mastery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`matricula` text NOT NULL,
	`question_id` text NOT NULL,
	`mode` text NOT NULL,
	`points` integer NOT NULL,
	`mastered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `union_game_mastery_player_question_unique` ON `union_game_mastery` (`matricula`,`question_id`);--> statement-breakpoint
CREATE INDEX `union_game_mastery_ranking_idx` ON `union_game_mastery` (`matricula`,`points`);--> statement-breakpoint
CREATE TABLE `union_game_players` (
	`matricula` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`best_streak` integer DEFAULT 0 NOT NULL,
	`answered_questions` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `union_game_players_points_activity_idx` ON `union_game_players` (`updated_at`);

CREATE TABLE `atlas_concept_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`map_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`action` text NOT NULL,
	`proposed_value` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_atlas_corrections_user_map_concept` ON `atlas_concept_corrections` (`user_id`,`map_id`,`concept_id`);--> statement-breakpoint
CREATE TABLE `atlas_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`captured_at` text NOT NULL,
	`confidence` integer DEFAULT 72 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_atlas_notes_user_updated` ON `atlas_notes` (`user_id`,`updated_at`);
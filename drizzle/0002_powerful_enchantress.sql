CREATE TABLE `knowledge_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`seed_note_id` text NOT NULL,
	`goal` text NOT NULL,
	`status` text DEFAULT 'frozen' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`spec_json` text NOT NULL,
	`nodes_json` text NOT NULL,
	`edges_json` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`convergence` integer DEFAULT 0 NOT NULL,
	`frozen_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_maps_user_updated` ON `knowledge_maps` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `mastery_evidence_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`map_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`evidence_type` text NOT NULL,
	`score` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mastery_user_map_concept` ON `mastery_evidence_records` (`user_id`,`map_id`,`concept_id`);
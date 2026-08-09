CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`verification_method` text NOT NULL,
	`status` text NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` text NOT NULL,
	`due_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`decision_card_id`) REFERENCES `decision_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`tool` text NOT NULL,
	`phase` text NOT NULL,
	`message` text NOT NULL,
	`duration_ms` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`memory_card_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`query` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`stopped_at` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`memory_card_id`) REFERENCES `memory_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_title` text NOT NULL,
	`source_url` text,
	`source_locator` text,
	`original_text` text NOT NULL,
	`image_data_url` text,
	`ocr_text` text,
	`ocr_confidence` integer,
	`selected_scope` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decision_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_card_id` text NOT NULL,
	`agent_run_id` text NOT NULL,
	`recommendation` text NOT NULL,
	`reasoning` text NOT NULL,
	`counter_evidence` text NOT NULL,
	`risk` text NOT NULL,
	`alternative` text NOT NULL,
	`experiment` text NOT NULL,
	`confidence` integer NOT NULL,
	`evidence_ids_json` text DEFAULT '[]' NOT NULL,
	`approved_at` text,
	`rejected_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`memory_card_id`) REFERENCES `memory_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`publisher` text NOT NULL,
	`summary` text NOT NULL,
	`stance` text NOT NULL,
	`relevance` integer NOT NULL,
	`retrieved_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memory_card_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_card_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`intent` text NOT NULL,
	`changed_by` text NOT NULL,
	`change_reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`memory_card_id`) REFERENCES `memory_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memory_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`capture_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`intent` text NOT NULL,
	`clarification` text,
	`clarification_skipped` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`confidence` text DEFAULT 'low' NOT NULL,
	`valid_until` text,
	`frozen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`capture_id`) REFERENCES `captures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memory_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_card_id` text NOT NULL,
	`outcome_id` text NOT NULL,
	`previous_version` integer NOT NULL,
	`new_version` integer NOT NULL,
	`previous_body` text NOT NULL,
	`proposed_body` text NOT NULL,
	`accepted` integer NOT NULL,
	`confirmed_by` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`memory_card_id`) REFERENCES `memory_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outcome_id`) REFERENCES `outcomes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`completed` integer NOT NULL,
	`result` text NOT NULL,
	`usefulness` integer NOT NULL,
	`evidence_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`memory_card_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`fields_json` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`memory_card_id`) REFERENCES `memory_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shares_token_hash_unique` ON `shares` (`token_hash`);--> statement-breakpoint
CREATE TABLE `workflow_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`memory_card_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`actor` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

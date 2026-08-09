CREATE TABLE `graph_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`thought_graph_id` text NOT NULL,
	`parent_revision_id` text,
	`lens_spec_id` text NOT NULL,
	`reason` text NOT NULL,
	`impact_json` text NOT NULL,
	`diff_summary_json` text NOT NULL,
	`status` text NOT NULL,
	`accepted_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`accepted_at` text,
	FOREIGN KEY (`thought_graph_id`) REFERENCES `thought_graphs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lens_specs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`raw_instruction` text NOT NULL,
	`organizing_principle` text NOT NULL,
	`scope` text DEFAULT 'corpus' NOT NULL,
	`selected_node_ids_json` text DEFAULT '[]' NOT NULL,
	`max_depth` integer DEFAULT 5 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `thought_graphs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`lens_spec_id` text NOT NULL,
	`source_note_ids_json` text DEFAULT '[]' NOT NULL,
	`nodes_json` text NOT NULL,
	`edges_json` text NOT NULL,
	`depth` integer DEFAULT 3 NOT NULL,
	`layout_mode` text DEFAULT 'tree' NOT NULL,
	`current_revision_id` text,
	`schema_version` text DEFAULT '1.0' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

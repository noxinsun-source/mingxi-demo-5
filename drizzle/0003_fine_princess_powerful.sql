ALTER TABLE `knowledge_maps` ADD `series_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `knowledge_maps` SET `series_id` = `id` WHERE `series_id` = '';--> statement-breakpoint
ALTER TABLE `knowledge_maps` ADD `parent_version_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_knowledge_maps_user_series_version` ON `knowledge_maps` (`user_id`,`series_id`,`version`);

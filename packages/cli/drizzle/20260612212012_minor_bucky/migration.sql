CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL CHECK(type IN ('doc', 'code_ref', 'story', 'diagram')),
	`title` text NOT NULL,
	`content` text,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_entities_type` ON `entities` (`type`);--> statement-breakpoint
CREATE TABLE `entity_tags` (
	`entity_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`entity_id`, `tag_id`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_entity_tags_tag` ON `entity_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `entity_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`change_type` text NOT NULL CHECK(change_type IN ('create', 'update', 'delete')),
	`changed_fields` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_versions_entity_id_version_unique` ON `entity_versions` (`entity_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_entity_versions_entity` ON `entity_versions` (`entity_id`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`type` text NOT NULL CHECK(type IN ('references', 'parent_of', 'child_of', 'blocks', 'blocked_by', 'related_to')),
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_links_source` ON `links` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_links_target` ON `links` (`target_id`);--> statement-breakpoint
CREATE TABLE `schema_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`aliases` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tags_parent` ON `tags` (`parent_id`);--> statement-breakpoint
CREATE VIRTUAL TABLE `entities_fts` USING fts5(
	`id`,
	`title`,
	`content`,
	content='entities',
	content_rowid='rowid'
);--> statement-breakpoint
CREATE TRIGGER `entities_ai` AFTER INSERT ON `entities` BEGIN
	INSERT INTO entities_fts(id, title, content) VALUES (new.id, new.title, new.content);
END;--> statement-breakpoint
CREATE TRIGGER `entities_ad` AFTER DELETE ON `entities` BEGIN
	INSERT INTO entities_fts(entities_fts, id, title, content) VALUES('delete', old.id, old.title, old.content);
END;--> statement-breakpoint
CREATE TRIGGER `entities_au` AFTER UPDATE ON `entities` BEGIN
	INSERT INTO entities_fts(entities_fts, id, title, content) VALUES('delete', old.id, old.title, old.content);
	INSERT INTO entities_fts(id, title, content) VALUES (new.id, new.title, new.content);
END;

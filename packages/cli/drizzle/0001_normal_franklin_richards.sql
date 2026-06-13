CREATE TABLE `entity_id_prefixes` (
	`scope` text NOT NULL,
	`entity_id` text NOT NULL,
	`prefix` text NOT NULL,
	`prefix_length` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`scope`, `entity_id`),
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entity_id_prefixes_scope_prefix` ON `entity_id_prefixes` (`scope`,`prefix`);--> statement-breakpoint
CREATE INDEX `idx_entity_id_prefixes_entity` ON `entity_id_prefixes` (`entity_id`);
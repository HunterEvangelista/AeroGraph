CREATE TABLE `terms` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_name` text NOT NULL,
	`kind` text NOT NULL CHECK(kind IN ('brand', 'project', 'feature', 'api', 'concept', 'package', 'other')),
	`description` text,
	`status` text DEFAULT 'active' NOT NULL CHECK(status IN ('active', 'deprecated', 'merged')),
	`merged_into_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merged_into_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_terms_kind_canonical_name` ON `terms` (`kind`,`canonical_name`);--> statement-breakpoint
CREATE INDEX `idx_terms_status` ON `terms` (`status`);--> statement-breakpoint
CREATE TABLE `term_names` (
	`term_id` text NOT NULL,
	`kind` text NOT NULL CHECK(kind IN ('brand', 'project', 'feature', 'api', 'concept', 'package', 'other')),
	`name` text NOT NULL CHECK(name = lower(name) AND name = trim(name) AND instr(name, ' ') = 0 AND instr(name, '_') = 0),
	`display_name` text NOT NULL,
	`name_kind` text NOT NULL CHECK(name_kind IN ('canonical', 'alias', 'deprecated')),
	`created_at` text NOT NULL,
	PRIMARY KEY(`term_id`, `name`),
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_term_names_kind_name` ON `term_names` (`kind`,`name`);--> statement-breakpoint
CREATE INDEX `idx_term_names_name` ON `term_names` (`name`);--> statement-breakpoint
CREATE TABLE `migration_journal` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL CHECK(operation IN ('rename', 'merge', 'deprecate', 'create')),
	`kind` text CHECK(kind IN ('brand', 'project', 'feature', 'api', 'concept', 'package', 'other')),
	`from_name` text NOT NULL,
	`to_name` text NOT NULL,
	`term_id` text NOT NULL,
	`affected_entity_ids` text NOT NULL,
	`affected_count` integer NOT NULL,
	`reason` text,
	`applied_at` text NOT NULL,
	`applied_by` text,
	`dry_run` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_journal_term` ON `migration_journal` (`term_id`);--> statement-breakpoint
CREATE INDEX `idx_journal_applied_at` ON `migration_journal` (`applied_at`);--> statement-breakpoint
ALTER TABLE `tags` ADD `term_id` text;--> statement-breakpoint
CREATE INDEX `idx_tags_term` ON `tags` (`term_id`);

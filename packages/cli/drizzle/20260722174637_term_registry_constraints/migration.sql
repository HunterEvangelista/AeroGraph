PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_term_names` (
	`term_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`name_kind` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`term_id`, `name`),
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "term_names_kind_check" CHECK(kind in ('brand', 'project', 'feature', 'api', 'concept', 'package', 'other')),
	CONSTRAINT "term_names_name_normalized_check" CHECK(name = lower(name) AND name = trim(name) AND instr(name, ' ') = 0 AND instr(name, '_') = 0 AND instr(name, ',') = 0),
	CONSTRAINT "term_names_name_kind_check" CHECK(name_kind in ('canonical', 'alias', 'deprecated')),
	CONSTRAINT "term_names_display_name_check" CHECK(instr(display_name, ',') = 0)
);
--> statement-breakpoint
INSERT INTO `__new_term_names`("term_id", "kind", "name", "display_name", "name_kind", "created_at") SELECT "term_id", "kind", "name", "display_name", "name_kind", "created_at" FROM `term_names`;--> statement-breakpoint
DROP TABLE `term_names`;--> statement-breakpoint
ALTER TABLE `__new_term_names` RENAME TO `term_names`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_term_names_kind_name` ON `term_names` (`kind`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_term_names_one_canonical` ON `term_names` (`term_id`) WHERE "term_names"."name_kind" = 'canonical';--> statement-breakpoint
CREATE INDEX `idx_term_names_name` ON `term_names` (`name`);--> statement-breakpoint
CREATE TABLE `__new_migration_journal` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`kind` text,
	`from_name` text NOT NULL,
	`to_name` text NOT NULL,
	`term_id` text NOT NULL,
	`affected_entity_ids` text NOT NULL,
	`affected_count` integer NOT NULL,
	`reason` text,
	`applied_at` text NOT NULL,
	`applied_by` text,
	`dry_run` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "migration_journal_operation_check" CHECK(operation in ('rename', 'merge', 'deprecate', 'create')),
	CONSTRAINT "migration_journal_kind_check" CHECK(kind is null OR kind in ('brand', 'project', 'feature', 'api', 'concept', 'package', 'other'))
);
--> statement-breakpoint
INSERT INTO `__new_migration_journal`("id", "operation", "kind", "from_name", "to_name", "term_id", "affected_entity_ids", "affected_count", "reason", "applied_at", "applied_by", "dry_run") SELECT "id", "operation", "kind", "from_name", "to_name", "term_id", "affected_entity_ids", "affected_count", "reason", "applied_at", "applied_by", "dry_run" FROM `migration_journal`;--> statement-breakpoint
DROP TABLE `migration_journal`;--> statement-breakpoint
ALTER TABLE `__new_migration_journal` RENAME TO `migration_journal`;--> statement-breakpoint
CREATE INDEX `idx_journal_term` ON `migration_journal` (`term_id`);--> statement-breakpoint
CREATE INDEX `idx_journal_applied_at` ON `migration_journal` (`applied_at`);--> statement-breakpoint
CREATE TRIGGER `terms_canonical_name_insert_check`
BEFORE INSERT ON `terms`
WHEN instr(NEW.canonical_name, ',') > 0
BEGIN
	SELECT RAISE(ABORT, 'terms canonical_name cannot contain commas');
END;--> statement-breakpoint
CREATE TRIGGER `terms_canonical_name_update_check`
BEFORE UPDATE OF `canonical_name` ON `terms`
WHEN instr(NEW.canonical_name, ',') > 0
BEGIN
	SELECT RAISE(ABORT, 'terms canonical_name cannot contain commas');
END;

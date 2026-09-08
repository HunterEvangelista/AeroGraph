PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
-- v4 canonical-name triggers are intentionally retired: the named CHECK below
-- is the shared invariant used by bootstrap SQL, Drizzle, and the app upgrader.
-- This Drizzle migration manages project-owned schema. Runtime/user DB upgrades
-- use the application upgrader's dynamic trigger preservation; term_names and
-- terms are altered in place here so unrelated user triggers survive.
DROP TRIGGER IF EXISTS `terms_canonical_name_insert_check`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `terms_canonical_name_update_check`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_terms_merged_into_id` ON `terms` (`merged_into_id`);--> statement-breakpoint
ALTER TABLE `terms` ADD COLUMN `replacement_term_id` text REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action CONSTRAINT "terms_lifecycle_shape_check" CHECK((status = 'active' AND merged_into_id IS NULL AND replacement_term_id IS NULL) OR (status = 'deprecated' AND merged_into_id IS NULL) OR (status = 'merged' AND merged_into_id IS NOT NULL AND replacement_term_id IS NULL)) CHECK(instr(canonical_name, ',') = 0);--> statement-breakpoint
CREATE TABLE `__new_migration_journal` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`kind` text,
	`from_name` text NOT NULL,
	`to_name` text,
	`term_id` text NOT NULL,
	`related_term_id` text,
	`affected_entity_ids` text NOT NULL,
	`affected_count` integer NOT NULL,
	`reason` text,
	`applied_at` text NOT NULL,
	`applied_by` text,
	`dry_run` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "migration_journal_operation_check" CHECK(operation in ('rename', 'merge', 'deprecate', 'create')),
	CONSTRAINT "migration_journal_kind_check" CHECK(kind is null OR kind in ('brand', 'project', 'feature', 'api', 'concept', 'package', 'other')),
	CONSTRAINT "migration_journal_semantics_check" CHECK((operation = 'create' AND (to_name IS NULL OR length(trim(to_name)) > 0) AND related_term_id IS NULL) OR (operation = 'rename' AND to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NULL) OR (operation = 'merge' AND to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NOT NULL) OR (operation = 'deprecate' AND ((to_name IS NULL AND related_term_id IS NULL) OR (to_name IS NOT NULL AND length(trim(to_name)) > 0 AND related_term_id IS NOT NULL))))
);
--> statement-breakpoint
-- Hand-edited data copy: historical targets are resolved from canonical terms
-- and every canonical, alias, and deprecated term_names row. An unresolved/ambiguous relation yields
-- NULL and is rejected by migration_journal_semantics_check; to_name is never rewritten.
INSERT INTO `__new_migration_journal`("id", "operation", "kind", "from_name", "to_name", "term_id", "related_term_id", "affected_entity_ids", "affected_count", "reason", "applied_at", "applied_by", "dry_run")
WITH candidates(journal_id, target_id) AS (
  SELECT m."id", target."id"
  FROM `migration_journal` m
  JOIN `terms` source ON source."id" = m."term_id"
  JOIN `terms` target ON target."id" = source."merged_into_id" AND target."kind" = source."kind"
  WHERE m."operation" = 'merge'
  UNION
  SELECT m."id", target."id"
  FROM `migration_journal` m
  JOIN `terms` source ON source."id" = m."term_id"
  JOIN `terms` target ON target."kind" = source."kind"
  LEFT JOIN `term_names` n ON n."term_id" = target."id" AND n."kind" = target."kind"
  WHERE m."operation" IN ('merge', 'deprecate')
    AND (
      lower(trim(target."canonical_name")) = lower(trim(m."to_name"))
      OR lower(trim(n."display_name")) = lower(trim(m."to_name"))
      OR n."name" = lower(replace(replace(trim(m."to_name"), ' ', '-'), '_', '-'))
    )
), candidate_counts(journal_id, candidate_count) AS (
  SELECT journal_id, count(*) FROM candidates GROUP BY journal_id
)
SELECT m."id", m."operation", m."kind", m."from_name",
  m."to_name",
  m."term_id",
  CASE WHEN m."operation" IN ('merge', 'deprecate') AND coalesce(cc.candidate_count, 0) = 1
    THEN (SELECT target_id FROM candidates WHERE journal_id = m."id")
    ELSE NULL
  END,
  m."affected_entity_ids", m."affected_count", m."reason", m."applied_at", m."applied_by", m."dry_run"
FROM `migration_journal` m
LEFT JOIN candidate_counts cc ON cc.journal_id = m."id";--> statement-breakpoint
-- migration_journal is the one unavoidable static Drizzle table rebuild. Drizzle
-- migrations manage project-owned schema; runtime/user DB upgrades use the
-- application upgrader's dynamic trigger preservation and do not promise that
-- arbitrary custom migration_journal triggers survive this rebuild.
DROP TABLE `migration_journal`;--> statement-breakpoint
ALTER TABLE `__new_migration_journal` RENAME TO `migration_journal`;--> statement-breakpoint
CREATE INDEX `idx_journal_term` ON `migration_journal` (`term_id`);--> statement-breakpoint
CREATE INDEX `idx_journal_related_term` ON `migration_journal` (`related_term_id`);--> statement-breakpoint
CREATE INDEX `idx_journal_applied_at` ON `migration_journal` (`applied_at`);--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
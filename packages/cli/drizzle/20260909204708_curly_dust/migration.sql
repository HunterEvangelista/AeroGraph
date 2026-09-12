CREATE TABLE `projects` (
	`id` text NOT NULL PRIMARY KEY,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "projects_id_nonempty_check" CHECK(length("id") > 0),
	CONSTRAINT "projects_name_nonempty_check" CHECK(length("name") > 0)
);
--> statement-breakpoint
CREATE TABLE `entity_projects` (
	`entity_id` text NOT NULL,
	`project_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `entity_projects_pk` PRIMARY KEY(`entity_id`, `project_id`),
	CONSTRAINT `fk_entity_projects_entity_id_entities_id_fk` FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_entity_projects_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `idx_entity_projects_project` ON `entity_projects` (`project_id`,`entity_id`);

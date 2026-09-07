DROP TRIGGER IF EXISTS `entities_ai`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `entities_ad`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `entities_au`;--> statement-breakpoint
DROP TABLE IF EXISTS `entities_fts`;--> statement-breakpoint
CREATE VIRTUAL TABLE `entities_fts` USING fts5(
	`id`,
	`title`,
	`content`,
	content='entities',
	content_rowid='rowid'
);--> statement-breakpoint
CREATE TRIGGER `entities_ai` AFTER INSERT ON `entities` BEGIN
	INSERT INTO entities_fts(rowid, id, title, content) VALUES (new.rowid, new.id, new.title, new.content);
END;--> statement-breakpoint
CREATE TRIGGER `entities_ad` AFTER DELETE ON `entities` BEGIN
	INSERT INTO entities_fts(entities_fts, rowid, id, title, content) VALUES('delete', old.rowid, old.id, old.title, old.content);
END;--> statement-breakpoint
CREATE TRIGGER `entities_au` AFTER UPDATE ON `entities` BEGIN
	INSERT INTO entities_fts(entities_fts, rowid, id, title, content) VALUES('delete', old.rowid, old.id, old.title, old.content);
	INSERT INTO entities_fts(rowid, id, title, content) VALUES (new.rowid, new.id, new.title, new.content);
END;--> statement-breakpoint
INSERT INTO entities_fts(entities_fts) VALUES ('rebuild');

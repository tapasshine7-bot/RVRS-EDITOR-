ALTER TABLE `sharedEditorSounds` ADD `moods` varchar(160) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sharedEditorSounds` ADD `licenseType` varchar(64) DEFAULT 'creator-owned' NOT NULL;--> statement-breakpoint
ALTER TABLE `sharedEditorSounds` ADD `creditLine` varchar(300) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sharedEditorSounds` ADD `sourceUrl` varchar(500) DEFAULT '' NOT NULL;
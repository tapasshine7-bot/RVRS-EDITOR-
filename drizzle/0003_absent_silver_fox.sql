CREATE TABLE `sharedEditorSounds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` varchar(500) NOT NULL,
	`category` varchar(64) NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`byteSize` int NOT NULL,
	`durationMs` int NOT NULL DEFAULT 0,
	`rightsAttested` int NOT NULL DEFAULT 0,
	`status` enum('published','removed') NOT NULL DEFAULT 'published',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sharedEditorSounds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sharedResourceReviews` MODIFY COLUMN `resourceType` enum('template','video','sound') NOT NULL;--> statement-breakpoint
ALTER TABLE `sharedEditorSounds` ADD CONSTRAINT `sharedEditorSounds_creatorId_users_id_fk` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shared_editor_sounds_status_updated_idx` ON `sharedEditorSounds` (`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `shared_editor_sounds_creator_idx` ON `sharedEditorSounds` (`creatorId`);
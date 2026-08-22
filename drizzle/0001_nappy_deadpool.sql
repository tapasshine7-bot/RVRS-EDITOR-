CREATE TABLE `sharedEditorTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` varchar(500) NOT NULL,
	`category` varchar(64) NOT NULL,
	`aspectRatio` varchar(16) NOT NULL,
	`projectData` json NOT NULL,
	`rightsAttested` int NOT NULL DEFAULT 0,
	`status` enum('published','removed') NOT NULL DEFAULT 'published',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sharedEditorTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sharedEditorVideos` (
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
	`width` int NOT NULL DEFAULT 0,
	`height` int NOT NULL DEFAULT 0,
	`rightsAttested` int NOT NULL DEFAULT 0,
	`status` enum('published','removed') NOT NULL DEFAULT 'published',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sharedEditorVideos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sharedTemplateFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`templateId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sharedTemplateFavorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_template_favorites_user_template_uq` UNIQUE(`userId`,`templateId`)
);
--> statement-breakpoint
ALTER TABLE `sharedEditorTemplates` ADD CONSTRAINT `sharedEditorTemplates_creatorId_users_id_fk` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sharedEditorVideos` ADD CONSTRAINT `sharedEditorVideos_creatorId_users_id_fk` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sharedTemplateFavorites` ADD CONSTRAINT `sharedTemplateFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sharedTemplateFavorites` ADD CONSTRAINT `sharedTemplateFavorites_templateId_sharedEditorTemplates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `sharedEditorTemplates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shared_editor_templates_status_updated_idx` ON `sharedEditorTemplates` (`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `shared_editor_templates_creator_idx` ON `sharedEditorTemplates` (`creatorId`);--> statement-breakpoint
CREATE INDEX `shared_editor_videos_status_updated_idx` ON `sharedEditorVideos` (`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `shared_editor_videos_creator_idx` ON `sharedEditorVideos` (`creatorId`);--> statement-breakpoint
CREATE INDEX `shared_template_favorites_template_idx` ON `sharedTemplateFavorites` (`templateId`);
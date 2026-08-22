CREATE TABLE `sharedSoundFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`soundId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sharedSoundFavorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_sound_favorites_user_sound_uq` UNIQUE(`userId`,`soundId`)
);
--> statement-breakpoint
ALTER TABLE `sharedSoundFavorites` ADD CONSTRAINT `sharedSoundFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sharedSoundFavorites` ADD CONSTRAINT `sharedSoundFavorites_soundId_sharedEditorSounds_id_fk` FOREIGN KEY (`soundId`) REFERENCES `sharedEditorSounds`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shared_sound_favorites_sound_idx` ON `sharedSoundFavorites` (`soundId`);
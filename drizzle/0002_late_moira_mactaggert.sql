CREATE TABLE `sharedResourceReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`resourceType` enum('template','video') NOT NULL,
	`resourceId` int NOT NULL,
	`stars` int NOT NULL,
	`body` varchar(600) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sharedResourceReviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_resource_reviews_user_resource_uq` UNIQUE(`userId`,`resourceType`,`resourceId`)
);
--> statement-breakpoint
ALTER TABLE `sharedResourceReviews` ADD CONSTRAINT `sharedResourceReviews_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shared_resource_reviews_resource_idx` ON `sharedResourceReviews` (`resourceType`,`resourceId`,`updatedAt`);
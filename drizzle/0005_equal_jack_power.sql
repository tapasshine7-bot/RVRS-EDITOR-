CREATE TABLE `sharedResourceReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`resourceType` enum('template','video','sound') NOT NULL,
	`resourceId` int NOT NULL,
	`reason` enum('rights','copyright','harassment','spam','other') NOT NULL,
	`details` varchar(600) NOT NULL DEFAULT '',
	`status` enum('open','resolved','dismissed') NOT NULL DEFAULT 'open',
	`activeKey` varchar(200),
	`moderatorId` int,
	`moderatorNote` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sharedResourceReports_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_resource_reports_active_uq` UNIQUE(`activeKey`)
);
--> statement-breakpoint
ALTER TABLE `sharedResourceReports` ADD CONSTRAINT `sharedResourceReports_reporterId_users_id_fk` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sharedResourceReports` ADD CONSTRAINT `sharedResourceReports_moderatorId_users_id_fk` FOREIGN KEY (`moderatorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shared_resource_reports_status_updated_idx` ON `sharedResourceReports` (`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `shared_resource_reports_reporter_idx` ON `sharedResourceReports` (`reporterId`,`createdAt`);
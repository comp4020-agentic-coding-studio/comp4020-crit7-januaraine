CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_code` text NOT NULL,
	`activity` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_minutes` integer NOT NULL,
	`end_minutes` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);

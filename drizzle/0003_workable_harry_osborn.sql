CREATE TABLE `clash_acknowledgements` (
	`session_a_id` integer NOT NULL,
	`session_b_id` integer NOT NULL,
	`acknowledged_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`session_a_id`, `session_b_id`),
	FOREIGN KEY (`session_a_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_b_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_pair_order" CHECK("clash_acknowledgements"."session_a_id" < "clash_acknowledgements"."session_b_id")
);

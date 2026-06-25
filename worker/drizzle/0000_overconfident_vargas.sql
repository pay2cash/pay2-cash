CREATE TABLE `mandates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payu_ref` text,
	`status` text NOT NULL,
	`limit_paise` integer NOT NULL,
	`spent_paise` integer DEFAULT 0 NOT NULL,
	`merchant` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`mandate_id` text NOT NULL,
	`payu_txn_id` text,
	`amount_paise` integer NOT NULL,
	`merchant` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mandate_id`) REFERENCES `mandates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`vpa` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL
);

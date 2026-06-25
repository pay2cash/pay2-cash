-- Two-sided platform: merchants (supply) + cards (credential B) + split fields on payments.
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`payu_child_id` text,
	`settle_vpa` text NOT NULL,
	`platform_fee_bps` integer DEFAULT 200 NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`card_token` text NOT NULL,
	`status` text NOT NULL,
	`limit_paise` integer NOT NULL,
	`spent_paise` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `merchant`;
--> statement-breakpoint
ALTER TABLE `payments` ADD `merchant_id` text;
--> statement-breakpoint
ALTER TABLE `payments` ADD `operator_share_paise` integer;
--> statement-breakpoint
ALTER TABLE `payments` ADD `platform_fee_paise` integer;

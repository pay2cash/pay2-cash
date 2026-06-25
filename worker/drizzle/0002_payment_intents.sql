-- Payment action intents (propose → confirm) + make payments.mandate_id nullable + add intent_id.
CREATE TABLE `payment_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mandate_id` text,
	`card_id` text,
	`merchant_id` text,
	`amount_paise` integer NOT NULL,
	`description` text,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`payu_ref` text,
	`approval_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments_new` (
	`id` text PRIMARY KEY NOT NULL,
	`mandate_id` text,
	`merchant_id` text,
	`intent_id` text,
	`payu_txn_id` text,
	`amount_paise` integer NOT NULL,
	`operator_share_paise` integer,
	`platform_fee_paise` integer,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `payments_new` (`id`, `mandate_id`, `merchant_id`, `payu_txn_id`, `amount_paise`, `operator_share_paise`, `platform_fee_paise`, `status`, `created_at`)
	SELECT `id`, `mandate_id`, `merchant_id`, `payu_txn_id`, `amount_paise`, `operator_share_paise`, `platform_fee_paise`, `status`, `created_at` FROM `payments`;
--> statement-breakpoint
DROP TABLE `payments`;
--> statement-breakpoint
ALTER TABLE `payments_new` RENAME TO `payments`;

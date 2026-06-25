-- ONDC Beckn callback capture (on_* responses from BPP/Pramaan) — used to assemble
-- the request/response logs submitted for Pramaan verification & prod approval.
CREATE TABLE `ondc_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`transaction_id` text,
	`message_id` text,
	`bpp_id` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);

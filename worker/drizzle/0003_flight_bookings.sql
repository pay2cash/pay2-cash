-- Flight bookings (EU use case): a Duffel order paid with a single-use € card.
CREATE TABLE `flight_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text,
	`offer_id` text NOT NULL,
	`order_id` text,
	`booking_reference` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);

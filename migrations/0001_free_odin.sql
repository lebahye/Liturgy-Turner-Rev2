CREATE TABLE `improvement_metrics` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`test_date` text NOT NULL,
	`test_type` text NOT NULL,
	`audio_file` text,
	`total_pages` integer NOT NULL,
	`correct_turns` integer NOT NULL,
	`missed_turns` integer NOT NULL,
	`false_positives` integer NOT NULL,
	`accuracy_percentage` real NOT NULL,
	`average_latency_ms` integer,
	`average_confidence` real,
	`notes` text,
	`improvements` text,
	`issues` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);

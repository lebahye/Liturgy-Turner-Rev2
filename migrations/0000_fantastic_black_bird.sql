CREATE TABLE `aggregated_fingerprints` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`pdf_path` text NOT NULL,
	`pdf_id` text,
	`page_id` text,
	`page_number` integer NOT NULL,
	`session_count` integer DEFAULT 1 NOT NULL,
	`average_timestamp_ms` integer NOT NULL,
	`averaged_features` text,
	`feature_history` text,
	`confidence` real DEFAULT 0,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_attempt_pages` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`attempt_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`transcript` text NOT NULL,
	`duration` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `learning_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `learning_attempts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`pdf_path` text NOT NULL,
	`pdf_id` text,
	`audio_path` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'completed' NOT NULL,
	`pages_processed` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `page_markers` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`session_id` text NOT NULL,
	`pdf_id` text,
	`page_id` text,
	`page_number` integer NOT NULL,
	`timestamp_ms` integer NOT NULL,
	`audio_features` text,
	`trigger_tokens` text,
	`trigger_confidence` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `page_sections` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`pdf_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`armenian_text` text,
	`phonetic_text` text,
	`english_text` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page_transcripts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`pdf_path` text NOT NULL,
	`pdf_id` text,
	`page_id` text,
	`page_number` integer NOT NULL,
	`transcript` text NOT NULL,
	`keywords` text,
	`session_count` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`name` text NOT NULL,
	`pdf_path` text NOT NULL,
	`pdf_id` text,
	`audio_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_pages` integer DEFAULT 1 NOT NULL,
	`sample_rate` integer DEFAULT 44100,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`filename` text NOT NULL,
	`original_name` text NOT NULL,
	`file_path` text NOT NULL,
	`file_type` text NOT NULL,
	`mime_type` text NOT NULL,
	`pdf_id` text,
	`uploaded_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `word_dictionary` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`pdf_id` text NOT NULL,
	`armenian` text NOT NULL,
	`phonetic` text NOT NULL,
	`page_number` integer,
	`occurrences` integer DEFAULT 1 NOT NULL,
	`confidence` real DEFAULT 1,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);

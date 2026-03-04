ALTER TABLE `request_logs` ADD `cache_creation_5m_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `request_logs` ADD `cache_creation_1h_tokens` integer DEFAULT 0 NOT NULL;

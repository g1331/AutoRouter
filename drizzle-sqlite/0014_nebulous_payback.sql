ALTER TABLE `upstreams` ADD `cliproxy_instance_id` text REFERENCES cliproxy_instances(id);--> statement-breakpoint
ALTER TABLE `upstreams` ADD `cliproxy_auth_file_name` text;--> statement-breakpoint
ALTER TABLE `upstreams` ADD `cliproxy_provider` text;

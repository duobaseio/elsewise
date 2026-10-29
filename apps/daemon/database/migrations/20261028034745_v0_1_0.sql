-- Create "project" table
CREATE TABLE `project` (
  `id` text NOT NULL,
  `name` text NOT NULL,
  `folder` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`id`)
) STRICT;
-- Create index "project_folder" to table: "project"
CREATE UNIQUE INDEX `project_folder` ON `project` (`folder`);
-- Create "workspace" table
CREATE TABLE `workspace` (
  `id` text NOT NULL,
  `project_id` text NOT NULL,
  `name` text NOT NULL,
  `absolute_path` text NOT NULL,
  `main` integer NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (main in (0, 1))
) STRICT;
-- Create index "workspace_absolute_path" to table: "workspace"
CREATE UNIQUE INDEX `workspace_absolute_path` ON `workspace` (`absolute_path`);
-- Create index "workspace_project_id" to table: "workspace"
CREATE INDEX `workspace_project_id` ON `workspace` (`project_id`);
-- Create index "workspace_main" to table: "workspace"
CREATE UNIQUE INDEX `workspace_main` ON `workspace` (`project_id`) WHERE main = 1;

-- Create "terminal" table
CREATE TABLE `terminal` (
  `id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `name` text NOT NULL,
  `columns` integer NOT NULL,
  `rows` integer NOT NULL,
  `exit_code` integer NULL,
  `exit_signal` text NULL,
  `buffer` blob NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`workspace_id`) REFERENCES `workspace` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE,
  CHECK (exit_code is null or exit_signal is null)
) STRICT;
-- Create index "terminal_workspace_id" to table: "terminal"
CREATE INDEX `terminal_workspace_id` ON `terminal` (`workspace_id`);

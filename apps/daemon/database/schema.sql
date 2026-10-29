-- Elsewise daemon's database.
--
-- Note:
-- - Paths are absolute protocol paths.
-- - Datetime is stored in Unix milliseconds.

create table project (
    id text not null primary key,
    name text not null,
    folder text not null unique, -- A human-readable project's folder name under `project/<folder>/workspaces/`.
    created_at integer not null
) strict;


create table workspace (
    id text not null primary key,
    project_id text not null references project (id) on delete cascade,
    name text not null,
    absolute_path text not null unique,
    main integer not null check (main in (0, 1)),
    created_at integer not null
) strict;

create index workspace_project_id on workspace (project_id);
create unique index workspace_main on workspace (project_id)
where main = 1; -- A single workspace main per project.


create table terminal (
    id text not null primary key,
    workspace_id text not null references workspace (id) on delete cascade,
    name text not null,
    columns integer not null,
    rows integer not null,
    exit_code integer,
    exit_signal text,
    buffer blob,
    created_at integer not null,
    check (exit_code is null or exit_signal is null)
) strict;

create index terminal_workspace_id on terminal (workspace_id);

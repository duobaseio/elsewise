-- Elsewise daemon's database.
--
-- Note:
-- - Paths are absolute protocol paths.
-- - Datetime is stored in Unix milliseconds.

create table project (
    id text not null primary key,
    name text not null,
    absolute_path text not null unique,
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

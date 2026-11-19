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
    relative_path text not null,
    env text not null,
    command text not null,
    restore integer not null,
    columns integer not null,
    rows integer not null,
    exit_code integer,
    exit_signal text,
    buffer blob,
    created_at integer not null,
    check (exit_code is null or exit_signal is null)
) strict;

create index terminal_workspace_id on terminal (workspace_id);


-- An agent the user entered by hand. An agent a plugin adds has no row.
create table agent (
    id text not null primary key,
    name text not null,
    program text not null,
    args text not null, -- A JSON array of strings.
    env text not null, -- A JSON object of strings.
    icon text, -- A square SVG document.
    created_at integer not null
) strict;


create table agent_session (
    id text not null primary key,
    workspace_id text not null references workspace (id) on delete cascade,
    -- The id of the plugin who owns it (e.g. @scope/name/<optional_id>) or an uuid from `agent` if manually imported.
    agent_id text not null,
    acp_session_id text,
    title text not null,
    created_at integer not null,
    updated_at integer not null
) strict;

create index agent_session_workspace_id on agent_session (workspace_id);

drop table if exists clients;

create table clients (
  id uuid primary key default gen_random_uuid(),
  uuid text unique not null,
  alias text,
  is_enabled boolean default true,
  running boolean default false,
  amount real,
  state text,
  created_at timestamp default now()
);

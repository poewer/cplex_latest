drop table if exists clients;

create table clients (
  id uuid primary key default gen_random_uuid(),

  uuid text unique not null,
  alias text,

  is_enabled boolean default true,
  running boolean default false,
  amount real,
  state text,

  -- Informacje o operacji "start_morning"
  last_start_morning_date date,
  start_morning_status text,
  start_morning_clicks int,
  balance_before text,
  balance_after text,

  refreshed_today boolean default false,
  error_message text,

  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  avatar_color text not null,
  car jsonb,
  home_city text,
  home_country text,
  invite_code text not null unique,
  recovery_hash text not null unique,
  recovery_enc text not null,
  local_only boolean not null default false,
  hide_from_leaderboards boolean not null default false,
  cloud_backup boolean not null default false,
  platform text not null,
  locale text,
  last_city text,
  last_country text,
  last_drive_at timestamptz,
  created_at timestamptz not null default now()
);
create index users_username_prefix on users (lower(username) text_pattern_ops);
create index users_display_name_prefix on users (lower(display_name) text_pattern_ops);

create table tokens (
  hash text primary key,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now()
);
create index tokens_user on tokens (user_id);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  description text not null default '',
  is_public boolean not null default true,
  owner_id uuid not null references users on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create index clubs_name_prefix on clubs (lower(name) text_pattern_ops);

create table club_members (
  user_id uuid primary key references users on delete cascade,
  club_id uuid not null references clubs on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default clock_timestamp()
);
create index club_members_club on club_members (club_id, joined_at);

create table friendships (
  user_id uuid not null references users on delete cascade,
  friend_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
create index friendships_friend on friendships (friend_id);

create table friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references users on delete cascade,
  to_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_id, to_id)
);
create index friend_requests_to on friend_requests (to_id);

create table drives (
  id uuid primary key,
  user_id uuid not null references users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  local_date date not null,
  local_hour smallint not null,
  distance_m double precision not null,
  duration_s double precision not null,
  moving_s double precision not null,
  max_speed_mps double precision not null,
  avg_speed_mps double precision not null,
  elevation_gain_m double precision not null,
  elevation_loss_m double precision not null,
  brake_presses integer not null,
  turns_left integer not null,
  turns_right integer not null,
  lane_changes integer not null,
  stops integer not null,
  city text,
  country_code text,
  cell_count integer not null,
  territory jsonb not null,
  created_at timestamptz not null default now()
);
create index drives_user_started on drives (user_id, started_at);
create index drives_started on drives (started_at);

create table cells (
  cell text primary key,
  owner_id uuid not null references users on delete cascade,
  club_id uuid references clubs on delete set null,
  claimed_at timestamptz not null,
  refreshed_at timestamptz not null,
  lat double precision not null,
  lng double precision not null
);
create index cells_owner on cells (owner_id, claimed_at);
create index cells_club on cells (club_id);
create index cells_latlng on cells (lat, lng);

create table cell_events (
  id bigserial primary key,
  cell text not null,
  from_user uuid references users on delete set null,
  to_user uuid not null references users on delete cascade,
  at timestamptz not null,
  kind text not null check (kind in ('claim', 'steal'))
);
create index cell_events_at on cell_events (at);
create index cell_events_cell_at on cell_events (cell, at);
create index cell_events_to on cell_events (to_user, kind, at);
create index cell_events_from on cell_events (from_user, at);

create table user_cells_ever (
  user_id uuid not null references users on delete cascade,
  cell text not null,
  primary key (user_id, cell)
);

create table user_trophies (
  user_id uuid not null references users on delete cascade,
  trophy_id text not null,
  tier smallint not null,
  earned_at timestamptz not null,
  primary key (user_id, trophy_id)
);

create table trophy_awards (
  user_id uuid not null references users on delete cascade,
  trophy_id text not null,
  tier smallint not null,
  earned_at timestamptz not null,
  primary key (user_id, trophy_id, tier)
);
create index trophy_awards_earned on trophy_awards (earned_at);

create table mods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  style text not null,
  prompt text not null default '',
  car_label text not null,
  color text,
  image bytea not null,
  mime text not null,
  created_at timestamptz not null default now()
);
create index mods_user on mods (user_id, created_at desc);

create table mod_usage (
  user_id uuid not null references users on delete cascade,
  day date not null,
  count integer not null,
  primary key (user_id, day)
);

create table mod_usage_global (
  day date primary key,
  count integer not null
);

create table backups (
  user_id uuid not null references users on delete cascade,
  drive_id text not null,
  data text not null,
  size integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, drive_id)
);

create table blocks (
  blocker_id uuid not null references users on delete cascade,
  blocked_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create index blocks_blocked on blocks (blocked_id);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users on delete set null,
  target_type text not null check (target_type in ('user', 'club')),
  target_id uuid not null,
  reason text not null check (reason in ('name', 'spam', 'cheating', 'other')),
  note text,
  created_at timestamptz not null default now()
);
create index reports_target on reports (target_type, target_id);

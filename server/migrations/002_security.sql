create index if not exists cells_claimed_at on cells (claimed_at);

alter table cells add column if not exists parent5 text;
create index if not exists cells_parent5 on cells (parent5);

create table if not exists mod_attempts (
  user_id uuid not null references users on delete cascade,
  day date not null,
  count integer not null,
  primary key (user_id, day)
);

create table if not exists mod_attempts_global (
  day date primary key,
  count integer not null
);

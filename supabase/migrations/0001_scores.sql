-- Fingertune leaderboard.
--
-- Run this once against the project, in the Supabase SQL editor.
--
-- The anon key that the game ships is public: it is in the JavaScript bundle,
-- which is what "anon key" means. So the key is not the security boundary —
-- this file is. Everything below assumes an attacker has the key, because
-- everyone does.
--
-- What that leaves, and what it does not:
--
-- * Anyone can insert a row. This is unavoidable: the game runs entirely in the
--   browser, so any score it sends is a score a player could have typed
--   instead. There is no replay to verify and no server-side simulation, and
--   adding one would mean running the whole judging pipeline a second time.
--   The board is therefore a place to put a number next to a name, not a ranked
--   ladder, and the README says so where a visitor reads it.
-- * Nobody can update or delete anything. Omitting those policies is what
--   stops a bad actor from rewriting or erasing other people's runs, which is
--   the damage actually worth preventing.
-- * Impossible rows are refused by the table itself, so garbage costs one
--   rejected request rather than a permanent line on the board.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  beatmap     text        not null,
  name        text        not null,
  score       integer     not null,
  accuracy    numeric(5,2) not null,
  max_combo   integer     not null,
  created_at  timestamptz not null default now(),

  -- Bounds, not guesses. A perfect run of the longest shipped chart is a few
  -- hundred thousand points, so ten million is far above anything reachable
  -- while still refusing the obvious nonsense.
  constraint scores_beatmap_len   check (char_length(beatmap) between 1 and 64),
  constraint scores_name_len      check (char_length(name) between 1 and 16),
  constraint scores_score_range   check (score >= 0 and score <= 10000000),
  constraint scores_accuracy_range check (accuracy >= 0 and accuracy <= 100),
  constraint scores_combo_range   check (max_combo >= 0 and max_combo <= 100000)
);

-- The board is always read as "top N of one chart", which is exactly this index.
create index if not exists scores_beatmap_score_idx
  on public.scores (beatmap, score desc);

alter table public.scores enable row level security;

-- Read: everything. A leaderboard nobody can read is a table.
drop policy if exists "scores are public" on public.scores;
create policy "scores are public"
  on public.scores for select
  using (true);

-- Write: insert only, and only rows that pass the checks above. There is
-- deliberately no update or delete policy for the anon role; with RLS on, an
-- operation with no policy is denied, so leaving them out is the denial.
drop policy if exists "anyone may add a score" on public.scores;
create policy "anyone may add a score"
  on public.scores for insert
  with check (true);

-- ---------------------------------------------------------------------------
-- One row per name, per chart: the best one.
--
-- Two problems, one mechanism.
--
-- The first is spam. RLS can say who may insert; it cannot say how often, so a
-- script in a loop would otherwise grow this table without limit. Folding every
-- run by the same name into a single row means a thousand posts leave one line.
--
-- The second is that the board would be useless without it. Someone who plays a
-- chart twenty times would hold the whole top twenty, and a leaderboard showing
-- one person's afternoon is not a leaderboard.
--
-- The trigger is SECURITY DEFINER because it performs an UPDATE, and the anon
-- role has no update policy — deliberately, so that a client cannot rewrite a
-- row directly. The update happens here instead, as the table owner, under
-- logic nobody outside this file controls. `search_path` is pinned, which is
-- the thing a SECURITY DEFINER function must never leave to chance.
--
-- Names are compared case-insensitively, so "Bob" cannot sit beside "bob".
-- ---------------------------------------------------------------------------

create unique index if not exists scores_one_per_name_idx
  on public.scores (beatmap, lower(name));

create or replace function public.keep_best_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.scores%rowtype;
begin
  select * into existing
    from public.scores
   where beatmap = new.beatmap
     and lower(name) = lower(new.name)
   for update;

  -- First run under this name on this chart: let the insert through.
  if not found then
    return new;
  end if;

  -- Better than what is there: overwrite it in place.
  if new.score > existing.score then
    update public.scores
       set score      = new.score,
           accuracy   = new.accuracy,
           max_combo  = new.max_combo,
           name       = new.name,
           created_at = now()
     where id = existing.id;
  end if;

  -- Returning NULL from a BEFORE INSERT trigger cancels the insert. Worse runs
  -- are therefore accepted by the API and quietly change nothing, which is the
  -- correct outcome: the client re-reads the board straight afterwards and sees
  -- the truth rather than a confirmation of something that did not happen.
  return null;
end;
$$;

drop trigger if exists scores_keep_best on public.scores;
create trigger scores_keep_best
  before insert on public.scores
  for each row execute function public.keep_best_score();

-- ---------------------------------------------------------------------------
-- Rate limit, per address.
--
-- The trigger above caps one name. It does nothing about a script that invents
-- a new name every time, which is the flood that could actually fill this
-- table. PostgREST hands the request's headers to Postgres, so the caller's
-- address is readable here and can be counted.
--
-- Two things this is honest about.
--
-- It stores a HASH of the address, never the address. An IP is personal data,
-- a leaderboard has no business keeping one, and a hash answers the only
-- question being asked — "is this the same caller as a minute ago" — without
-- keeping the answer to any other. Rows older than a day are deleted, because
-- a rate limiter that remembers last week is a log nobody asked for.
--
-- And it is a speed bump, not a wall. X-Forwarded-For is what the edge reports;
-- someone with a pool of proxies gets a fresh budget per address. The point is
-- to make casual flooding cost more than it is worth, which it does, and not to
-- pretend a static site can authenticate anybody.
-- ---------------------------------------------------------------------------

create table if not exists public.score_posts (
  ip_hash   text        not null,
  posted_at timestamptz not null default now()
);

create index if not exists score_posts_recent_idx
  on public.score_posts (ip_hash, posted_at desc);

-- No policies at all, and RLS on: with row-level security enabled, an operation
-- without a policy is denied. The anon role therefore cannot read this table,
-- cannot write to it, and cannot learn who has posted. Only the SECURITY
-- DEFINER function below touches it.
alter table public.score_posts enable row level security;

create or replace function public.rate_limit_scores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 20 runs an hour. A single play takes a minute or two, so no human reaches
  -- this; a loop reaches it in seconds.
  max_per_hour constant integer := 20;
  forwarded    text;
  client_ip    text;
  hashed       text;
  recent       integer;
begin
  forwarded := current_setting('request.headers', true)::json ->> 'x-forwarded-for';

  -- No header: local development, or a direct connection from the SQL editor.
  -- Skipping beats refusing every insert because a proxy is not in the way.
  if forwarded is null or forwarded = '' then
    return new;
  end if;

  -- The header is a list; the left-most entry is the original client.
  client_ip := btrim(split_part(forwarded, ',', 1));
  hashed := md5(client_ip || '::fingertune-scores');

  select count(*) into recent
    from public.score_posts
   where ip_hash = hashed
     and posted_at > now() - interval '1 hour';

  if recent >= max_per_hour then
    raise exception 'Too many scores from this address. Try again later.'
      using errcode = 'check_violation';
  end if;

  insert into public.score_posts (ip_hash) values (hashed);

  -- Housekeeping on the way through, so nothing has to be scheduled. One
  -- delete on an indexed column, against a table that stays small precisely
  -- because of this line.
  delete from public.score_posts where posted_at < now() - interval '1 day';

  return new;
end;
$$;

-- Runs before keep_best_score: there is no reason to look up an existing row
-- for a caller that is about to be refused. Postgres fires BEFORE triggers in
-- name order, and "a_" sorts ahead of "scores_".
drop trigger if exists a_scores_rate_limit on public.scores;
create trigger a_scores_rate_limit
  before insert on public.scores
  for each row execute function public.rate_limit_scores();

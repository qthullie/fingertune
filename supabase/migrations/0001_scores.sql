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

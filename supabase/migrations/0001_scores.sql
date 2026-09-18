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

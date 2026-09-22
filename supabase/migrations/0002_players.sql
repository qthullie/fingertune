-- Fingertune leaderboard, part two: a name belongs to someone.
--
-- Run this once, after 0001, in the Supabase SQL editor. It also needs one
-- switch in the dashboard: Authentication -> Sign In / Providers -> "Allow
-- anonymous sign-ins". Without it the game can still read the board, but
-- nobody can post to it.
--
-- Until now the name WAS the identity. Typing "Bob" and posting a better run
-- raised Bob's row, because nothing but the string said whose row it was. So
-- this gives every player an id, and makes the name a property of the id.
--
-- The id is a Supabase anonymous account: created on the first post, with no
-- email and no password, held by the browser as a signed token. That is what
-- makes it worth more than an id generated in the page: the server signs it,
-- so a player can prove which id is theirs, and the policies below can compare
-- against it instead of trusting a column the client filled in.
--
-- Not an IP address. An address is shared by a whole office behind one NAT,
-- changes when a laptop changes networks, and is personal data a leaderboard
-- has no business keeping. It still does one job, in 0001: counting posts.
--
-- What it costs, said plainly: the identity lives in one browser. Clear the
-- site data and the old id, with its name, is out of reach. Linking an email
-- to an anonymous account is what Supabase offers for that, and nothing here
-- rules it out later.

-- ---------------------------------------------------------------------------
-- Players: one row per id, holding the name shown on the board.
-- ---------------------------------------------------------------------------

create table if not exists public.players (
  id          uuid        primary key default auth.uid()
                          references auth.users (id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now(),

  constraint players_name_len check (char_length(name) between 1 and 16)
);

-- The client strips these already. The table refuses them anyway, because the
-- client is the one party here that cannot be trusted: control characters
-- break the row, and zero-width and bidi marks let one name render as another
-- — exactly what someone would try on a leaderboard.
--
-- Written as \u escapes, never as the characters themselves: an invisible
-- character in a SQL file does not reliably survive being pasted into a
-- browser editor, and a regex range whose ends went missing is invalid,
-- which is how the first version of this constraint broke every insert. And
-- listed one by one for translate() rather than as a regex range, so nothing
-- depends on how a range is interpreted.
--
-- Dropped and re-added rather than declared in the CREATE above, so rerunning
-- this file also repairs a table created by an earlier version of it.
alter table public.players drop constraint if exists players_name_clean;
alter table public.players add constraint players_name_clean check (
  name = btrim(name)
  and name !~ '[[:cntrl:]]'
  and translate(
        name,
        E'\u200B\u200C\u200D\u200E\u200F\u2028\u2029\u202A\u202B\u202C\u202D\u202E\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\uFEFF',
        ''
      ) = name
);

-- One name, one player. Case-insensitive, so "Bob" cannot sit beside "bob".
create unique index if not exists players_name_unique_idx
  on public.players (lower(name));

alter table public.players enable row level security;

-- Names are public: they are the point of the board.
drop policy if exists "players are public" on public.players;
create policy "players are public"
  on public.players for select
  using (true);

-- A player creates exactly one row, their own, and may rename it. No delete:
-- a name that vanished would leave scores pointing at nobody.
drop policy if exists "claim your own name" on public.players;
create policy "claim your own name"
  on public.players for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "rename yourself" on public.players;
create policy "rename yourself"
  on public.players for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Scores: owned by a player, not by a string.
-- ---------------------------------------------------------------------------

alter table public.scores
  add column if not exists player_id uuid
    references public.players (id) on delete cascade;

-- Rows posted before identities existed have no owner and cannot be given
-- one: a name was never proof of anything, so attaching them to whoever holds
-- that name now would hand out runs to the wrong person. They go.
delete from public.scores where player_id is null;

alter table public.scores alter column player_id set not null;
alter table public.scores alter column player_id set default auth.uid();

-- The name now lives on the player. Kept here as well, it would go stale on
-- the first rename and let a row say something its owner no longer does.
drop index if exists public.scores_one_per_name_idx;
alter table public.scores drop column if exists name;

-- One row per player, per chart: their best.
create unique index if not exists scores_one_per_player_idx
  on public.scores (beatmap, player_id);

-- Imported charts get a fresh id on every import, so a board for one would be
-- a board of one run that nobody else could ever join. The client does not
-- post them; the table makes sure.
alter table public.scores drop constraint if exists scores_builtin_only;
alter table public.scores
  add constraint scores_builtin_only check (beatmap !~ '^import-');

drop policy if exists "anyone may add a score" on public.scores;
drop policy if exists "players post their own runs" on public.scores;
create policy "players post their own runs"
  on public.scores for insert
  to authenticated
  with check (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- keep_best_score, keyed on the player.
--
-- The ownership check at the top is not redundant with the policy above, and
-- it is the line in this file that matters most. Postgres evaluates an insert
-- policy's WITH CHECK only on the row that is finally inserted, after BEFORE
-- triggers have run. This trigger cancels the insert and performs an UPDATE of
-- its own, as the table owner — so for a player who already has a row, the
-- policy is never consulted at all. Without this check, anyone could post
-- under somebody else's id and raise their score, which is the very thing the
-- ids exist to prevent.
-- ---------------------------------------------------------------------------

create or replace function public.keep_best_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.scores%rowtype;
begin
  if new.player_id is distinct from auth.uid() then
    raise exception 'A score can only be posted by its own player.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into existing
    from public.scores
   where beatmap = new.beatmap
     and player_id = new.player_id
   for update;

  if not found then
    return new;
  end if;

  if new.score > existing.score then
    update public.scores
       set score      = new.score,
           accuracy   = new.accuracy,
           max_combo  = new.max_combo,
           created_at = now()
     where id = existing.id;
  end if;

  -- Cancels the insert: see 0001.
  return null;
end;
$$;

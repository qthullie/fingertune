-- The board's security, checked as the roles PostgREST uses.
--
-- Each check runs as `anon` or `authenticated`, with the JWT claims PostgREST
-- would set, and prints PASS or FAIL. A check that must be refused catches the
-- error. Run through run.sh, which builds a fresh database first.
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on

create function pg_temp.as_user(sub text) returns void language plpgsql as $$
begin
  if sub is null then
    perform set_config('role', 'anon', false);
    perform set_config('request.jwt.claims', '', false);
  else
    perform set_config('role', 'authenticated', false);
    perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, false);
  end if;
end $$;

create function pg_temp.expect_refused(label text, stmt text) returns text language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n = 0 then return 'PASS  ' || label || '  (0 rows)'; end if;
  return 'FAIL  ' || label || '  (' || n || ' rows affected)';
exception when others then
  return 'PASS  ' || label || '  (' || sqlstate || ': ' || sqlerrm || ')';
end $$;

create function pg_temp.expect_ok(label text, stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'PASS  ' || label;
exception when others then
  return 'FAIL  ' || label || '  (' || sqlstate || ': ' || sqlerrm || ')';
end $$;

-- run.sh posts one row under 0001's rules before applying 0002.
\echo '--- migration'
select case when (select count(*) from public.scores) = 0
  then 'PASS  0002 removed the ownerless row from 0001' else 'FAIL  ownerless rows survived 0002' end;

\echo '--- identities'
select pg_temp.as_user(null);
select pg_temp.expect_refused('anon cannot claim a name',
  $q$insert into public.players (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice')$q$);

select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select pg_temp.expect_ok('A claims Alice', $q$insert into public.players (name) values ('Alice')$q$);
select pg_temp.expect_refused('A cannot create a row for B',
  $q$insert into public.players (id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Mallory')$q$);

select pg_temp.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select pg_temp.expect_refused('B cannot take "alice" (case-insensitive)',
  $q$insert into public.players (name) values ('alice')$q$);
select pg_temp.expect_refused('zero-width space refused',
  $q$insert into public.players (name) values (E'Al\u200Bice')$q$);
select pg_temp.expect_refused('bidi override refused',
  $q$insert into public.players (name) values (E'Bob\u202E')$q$);
select pg_temp.expect_refused('leading space refused',
  $q$insert into public.players (name) values (' Bob')$q$);
select pg_temp.expect_ok('B claims Bob', $q$insert into public.players (name) values ('Bob')$q$);
select pg_temp.expect_refused('B cannot rename A',
  $q$update public.players set name = 'Hacked' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$);
select pg_temp.expect_refused('B cannot delete A',
  $q$delete from public.players where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$q$);

\echo '--- scores'
select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select pg_temp.expect_ok('A posts 5000',
  $q$insert into public.scores (beatmap, player_id, score, accuracy, max_combo) values ('first-steps', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5000, 90, 30)$q$);
select pg_temp.expect_ok('A posts a worse 3000',
  $q$insert into public.scores (beatmap, player_id, score, accuracy, max_combo) values ('first-steps', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3000, 80, 20)$q$);
select case when (select score from public.scores where player_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 5000
  then 'PASS  worse run changed nothing' else 'FAIL  worse run changed the row' end;
select pg_temp.expect_ok('A posts 8000',
  $q$insert into public.scores (beatmap, player_id, score, accuracy, max_combo) values ('first-steps', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 8000, 95, 40)$q$);
select case when (select count(*) || ':' || max(score) from public.scores where player_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = '1:8000'
  then 'PASS  one row, raised to 8000' else 'FAIL  expected one row at 8000' end;
select pg_temp.expect_refused('A cannot edit own score directly',
  $q$update public.scores set score = 9999999$q$);

select pg_temp.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select pg_temp.expect_refused('B cannot raise A''s existing row (trigger path)',
  $q$insert into public.scores (beatmap, player_id, score, accuracy, max_combo) values ('first-steps', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 9000000, 100, 99)$q$);
-- "0 rows" proves nothing on that path: the trigger cancels every insert it
-- handles, legitimate or not. Only the data says whether it moved.
select case when (select score from public.scores where player_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 8000
  then 'PASS  A''s score still 8000 after B''s attempt' else 'FAIL  B moved A''s score' end;
select pg_temp.expect_refused('B cannot create a row for A (policy path)',
  $q$insert into public.scores (beatmap, player_id, score, accuracy, max_combo) values ('other-map', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100, 50, 1)$q$);
select pg_temp.expect_refused('B cannot delete A''s score',
  $q$delete from public.scores$q$);
select pg_temp.expect_refused('imported chart refused',
  $q$insert into public.scores (beatmap, player_id, score, accuracy, max_combo) values ('import-song-abc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 50, 1)$q$);
select pg_temp.expect_ok('B posts 6000 with player_id omitted (defaults to self)',
  $q$insert into public.scores (beatmap, score, accuracy, max_combo) values ('first-steps', 6000, 88, 25)$q$);
select pg_temp.expect_ok('B renames to Robert', $q$update public.players set name = 'Robert' where id = auth.uid()$q$);

select pg_temp.as_user(null);
select pg_temp.expect_refused('anon cannot post a score',
  $q$insert into public.scores (beatmap, player_id, score, accuracy, max_combo) values ('first-steps', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 1)$q$);

\echo '--- the board, read as anon, joined the way PostgREST embeds players(name)'
select string_agg(p.name || '=' || s.score, ', ' order by s.score desc)
  from public.scores s join public.players p on p.id = s.player_id
 where s.beatmap = 'first-steps';
select case when (select string_agg(p.name || '=' || s.score, ', ' order by s.score desc)
                    from public.scores s join public.players p on p.id = s.player_id
                   where s.beatmap = 'first-steps') = 'Alice=8000, Robert=6000'
  then 'PASS  board reads Alice=8000, Robert=6000 (rename followed)' else 'FAIL  board content' end;
select case when (select count(*) from public.score_posts) = 0
  then 'PASS  score_posts invisible to anon' else 'FAIL  score_posts readable' end;

\echo '--- the upsert the client sends: POST players?on_conflict=id, merge-duplicates'
select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select pg_temp.expect_ok('A renames via upsert',
  $q$insert into public.players (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alicia') on conflict (id) do update set id = excluded.id, name = excluded.name$q$);
select pg_temp.expect_refused('A cannot upsert into Robert (taken by B)',
  $q$insert into public.players (id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ROBERT') on conflict (id) do update set id = excluded.id, name = excluded.name$q$);
select pg_temp.expect_refused('A cannot upsert over B''s row',
  $q$insert into public.players (id, name) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Owned') on conflict (id) do update set id = excluded.id, name = excluded.name$q$);
select case when (select string_agg(name, ',' order by name) from public.players) = 'Alicia,Robert'
  then 'PASS  names are Alicia,Robert' else 'FAIL  names: ' || (select string_agg(name, ',' order by name) from public.players) end;

-- `record_place_use` — the address book's only write.
--
-- The book is the product's main cost lever: address entry is 78% of per-user
-- COGS, and every stop added from a remembered place is an autocomplete session
-- not opened (docs/31_COST_MODEL.md §8). Filling it has to be free, atomic and
-- impossible to attribute to the wrong user.
--
-- **The increment is done in the database, not read-modify-written by the
-- client.** A driver adding the same address on a phone and a tablet would
-- otherwise have both read `use_count = 3` and both write `4`, and the count
-- that decides what appears at the top of Saved would drift downward for exactly
-- the addresses used most.
--
-- **The owner comes from `auth.uid()` inside the function.** A `user_id` sent by
-- the client is a claim the policy then has to disprove; taken from the session
-- it is a fact. `security invoker` keeps RLS in force, so this adds a capability
-- rather than a bypass.
--
-- Specification: docs/12_DATABASE.md §`favourites`, ADR-0015.

create function record_place_use(p_place_id text)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into favourites (user_id, place_id, use_count, last_used_at)
  values ((select auth.uid()), p_place_id, 1, now())
  on conflict (user_id, place_id) do update
     set use_count    = favourites.use_count + 1,
         last_used_at = now();
$$;

comment on function record_place_use is
  'Records one use of a place for the calling user, creating the address-book entry if it is new. Atomic, and owned by auth.uid() rather than by anything the client sends.';

-- `authenticated` only. `anon` has no book to write to, and granting it would
-- create rows owned by a null user that nothing could ever read or purge.
revoke execute on function record_place_use(text) from public;
grant execute on function record_place_use(text) to authenticated;

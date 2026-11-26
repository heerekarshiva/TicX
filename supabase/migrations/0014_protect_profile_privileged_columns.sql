-- ============================================================================
-- TICX migration 0014: close a privilege-escalation hole in `profiles`.
-- `profiles_update_own` lets a signed-in user UPDATE any column of their own row, including `role`.
-- Anyone with a session could run  update profiles set role='admin'  from the browser.
-- This trigger blocks browser-originated changes (anon/authenticated JWTs) to role, fraud_state and
-- phone_verified. Server code using the service-role key (every existing writer of those columns) and the
-- SQL editor / migrations (no JWT) are unaffected. No columns or policies are altered.
-- Make someone admin afterwards in the SQL editor:  update profiles set role='admin' where id='<uuid>';
-- Rollback: supabase/rollback/0014_protect_profile_privileged_columns_down.sql
-- ============================================================================
create or replace function protect_profile_privileged_columns() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.role := 'user'; new.fraud_state := 'NORMAL'; new.phone_verified := false;
    elsif new.role is distinct from old.role
       or new.fraud_state is distinct from old.fraud_state
       or new.phone_verified is distinct from old.phone_verified then
      raise exception 'Not allowed to change protected profile fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile_privileged_columns on profiles;
create trigger trg_protect_profile_privileged_columns
  before insert or update on profiles
  for each row execute function protect_profile_privileged_columns();

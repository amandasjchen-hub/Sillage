
-- Fix touch_updated_at search_path
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin new.updated_at = now(); return new; end; $$;

-- Lock down handle_new_user (trigger still works; revoke direct execute)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

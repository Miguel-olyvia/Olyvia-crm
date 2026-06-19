-- ============================================================
-- Correcção 1: current_business_user_id e auth_to_business_user_map
-- ============================================================
-- auth_to_business_user_map está vazia — nunca foi populada.
-- current_business_user_id() devolvia NULL para todos os utilizadores,
-- bloqueando todas as políticas RLS com created_by = current_business_user_id().
-- Solução: fallback directo a anew_users.id se o mapa não tiver entrada.

create or replace function public.current_business_user_id()
returns uuid
language sql stable security definer
set search_path = public as $$
  select coalesce(
    -- ramo 1: mapa explícito (retrocompatibilidade)
    (select m.business_user_id
       from public.auth_to_business_user_map m
      where m.auth_user_id = auth.uid()
      limit 1),
    -- ramo 2: anew_users.id directo (novo sistema, mapa não populado)
    (select u.id
       from public.anew_users u
      where u.auth_user_id = auth.uid()
      limit 1)
  )
$$;

-- Trigger: popula auth_to_business_user_map automaticamente em novos anew_users
create or replace function public.sync_auth_to_business_user_map()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.auth_to_business_user_map (auth_user_id, business_user_id)
  values (NEW.auth_user_id, NEW.id)
  on conflict (auth_user_id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_auth_business_map on public.anew_users;
create trigger trg_sync_auth_business_map
  after insert on public.anew_users
  for each row execute function public.sync_auth_to_business_user_map();

-- Backfill: popular mapa para anew_users já existentes
insert into public.auth_to_business_user_map (auth_user_id, business_user_id)
select auth_user_id, id
  from public.anew_users
 where auth_user_id is not null
on conflict (auth_user_id) do nothing;

-- ============================================================
-- Correcção 2: is_system_admin / is_system_admin_check / is_system_admin_user
-- ============================================================
-- Na baseline estas funções consultavam profiles.tipo = 'system_admin',
-- mas a tabela profiles não existe nesta BD.
-- Reescrever para usar exclusivamente anew_memberships/anew_roles.

create or replace function public.is_system_admin(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1
      from public.anew_users au
      join public.anew_memberships am on am.user_id = au.id and am.status = 'active'
      join public.anew_roles ar       on ar.id = am.role_id
     where au.auth_user_id = _user_id
       and ar.code in ('system_admin', 'super_admin')
  )
$$;

create or replace function public.is_system_admin_check(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1
      from public.anew_users au
      join public.anew_memberships am on am.user_id = au.id and am.status = 'active'
      join public.anew_roles ar       on ar.id = am.role_id
     where au.auth_user_id = _user_id
       and ar.code in ('system_admin', 'super_admin')
  )
$$;

create or replace function public.is_system_admin_user(_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1
      from public.anew_users au
      join public.anew_memberships am on am.user_id = au.id and am.status = 'active'
      join public.anew_roles ar       on ar.id = am.role_id
     where au.auth_user_id = _user_id
       and ar.code in ('system_admin', 'super_admin')
  )
$$;

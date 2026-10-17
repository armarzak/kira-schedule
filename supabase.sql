-- Расписание Киры: схема и права для Supabase.
-- Выполнить целиком один раз в SQL Editor (кнопка Run).
-- Семейный код — это пароль от ваших данных, он же вводится в приложении.
-- В файле он намеренно заменён заглушкой: если выложить папку в публичный
-- репозиторий, настоящий код стал бы доступен всем. Держите его в менеджере
-- паролей, а в базе он уже прописан.

-- 1. Таблицы ---------------------------------------------------------------

create table if not exists public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Семья',
  join_code  text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

-- Все данные приложения лежат построчно: занятие, смена, назначение, домашка.
create table if not exists public.items (
  family_id  uuid not null references public.families(id) on delete cascade,
  id         text not null,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (family_id, id)
);

create index if not exists items_family_updated on public.items (family_id, updated_at);

-- 2. Доступ ----------------------------------------------------------------

alter table public.families      enable row level security;
alter table public.family_members enable row level security;
alter table public.items         enable row level security;

-- Проверка членства отдельной функцией, иначе политика на family_members
-- начала бы спрашивать саму себя.
create or replace function public.is_member(f uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = f and m.user_id = auth.uid()
  );
$$;

drop policy if exists "family read" on public.families;
create policy "family read" on public.families
  for select to authenticated using (public.is_member(id));

drop policy if exists "members read" on public.family_members;
create policy "members read" on public.family_members
  for select to authenticated using (public.is_member(family_id));

drop policy if exists "items read" on public.items;
create policy "items read" on public.items
  for select to authenticated using (public.is_member(family_id));

drop policy if exists "items insert" on public.items;
create policy "items insert" on public.items
  for insert to authenticated with check (public.is_member(family_id));

drop policy if exists "items update" on public.items;
create policy "items update" on public.items
  for update to authenticated
  using (public.is_member(family_id)) with check (public.is_member(family_id));

grant select on public.families, public.family_members to authenticated;
grant select, insert, update on public.items to authenticated;

-- 3. Вход по семейному коду -------------------------------------------------

create or replace function public.join_family(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then
    raise exception 'Сначала нужно войти';
  end if;
  select id into f from public.families where join_code = code;
  if f is null then
    raise exception 'Неизвестный семейный код';
  end if;
  insert into public.family_members (family_id, user_id)
  values (f, auth.uid())
  on conflict do nothing;
  return f;
end;
$$;

revoke all on function public.join_family(text) from public;
grant execute on function public.join_family(text) to authenticated;

-- 4. Ваша семья -------------------------------------------------------------

insert into public.families (name, join_code)
values ('Наша семья', 'ЗАМЕНИ-НА-СВОЙ-КОД')
on conflict (join_code) do nothing;

-- Готово. Семейный код вводят все четверо в приложении, в разделе «Ещё».
-- Сменить его потом: update public.families set join_code = 'новый-код';
-- и, если нужно отрезать чужое устройство, delete from public.family_members;

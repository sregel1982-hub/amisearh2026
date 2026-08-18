-- AMISEARCH Teacher Hub production schema
-- Futtasd egyszer a Supabase Dashboard > SQL Editor felületén.
-- A publikus anon kulcs kliensoldali használata rendben van, service_role kulcsot soha ne tegyél HTML-be.

create extension if not exists pgcrypto;

-- Profilok: ha már létezik profiles táblád, ezt a részt hasonlítsd össze a saját oszlopneveiddel.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username text,
  status text not null default 'teacher' check (status in ('teacher', 'student', 'admin')),
  plan text not null default 'Free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  subject text not null check (char_length(trim(subject)) between 1 and 120),
  students integer not null default 0 check (students >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text,
  original_name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists teacher_classes_teacher_id_idx on public.teacher_classes(teacher_id);
create index if not exists teacher_notes_owner_id_idx on public.teacher_notes(owner_id);

-- Új regisztrációnál automatikusan létrejön a tanári profil.
create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'teacher'
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, profiles.full_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_teacher on auth.users;
create trigger on_auth_user_created_teacher
after insert on auth.users
for each row execute procedure public.handle_new_teacher();

-- RLS: minden tanár csak a saját osztályait és jegyzeteit látja.
alter table public.profiles enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.teacher_notes enable row level security;

drop policy if exists "profile own read" on public.profiles;
create policy "profile own read" on public.profiles
for select to authenticated using (id = auth.uid());

drop policy if exists "profile own update" on public.profiles;
create policy "profile own update" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "classes own read" on public.teacher_classes;
create policy "classes own read" on public.teacher_classes
for select to authenticated using (teacher_id = auth.uid());

drop policy if exists "classes own insert" on public.teacher_classes;
create policy "classes own insert" on public.teacher_classes
for insert to authenticated with check (teacher_id = auth.uid());

drop policy if exists "classes own update" on public.teacher_classes;
create policy "classes own update" on public.teacher_classes
for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists "classes own delete" on public.teacher_classes;
create policy "classes own delete" on public.teacher_classes
for delete to authenticated using (teacher_id = auth.uid());

drop policy if exists "notes own read" on public.teacher_notes;
create policy "notes own read" on public.teacher_notes
for select to authenticated using (owner_id = auth.uid());

drop policy if exists "notes own insert" on public.teacher_notes;
create policy "notes own insert" on public.teacher_notes
for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists "notes own delete" on public.teacher_notes;
create policy "notes own delete" on public.teacher_notes
for delete to authenticated using (owner_id = auth.uid());

-- Storage bucket + saját mappára korlátozott hozzáférés.
insert into storage.buckets (id, name, public)
values ('teacher-notes', 'teacher-notes', false)
on conflict (id) do nothing;

drop policy if exists "teacher notes upload own folder" on storage.objects;
create policy "teacher notes upload own folder" on storage.objects
for insert to authenticated
with check (bucket_id = 'teacher-notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "teacher notes read own folder" on storage.objects;
create policy "teacher notes read own folder" on storage.objects
for select to authenticated
using (bucket_id = 'teacher-notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "teacher notes delete own folder" on storage.objects;
create policy "teacher notes delete own folder" on storage.objects
for delete to authenticated
using (bucket_id = 'teacher-notes' and (storage.foldername(name))[1] = auth.uid()::text);

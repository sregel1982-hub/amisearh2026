-- AMISEARCH Teacher Hub: persistent classes
-- Run once in the Supabase SQL editor before deploying the updated Netlify function.

create table if not exists public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  subject text not null check (char_length(trim(subject)) between 1 and 160),
  students integer not null default 0 check (students >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_classes_teacher_id_created_at_idx
  on public.teacher_classes (teacher_id, created_at desc);

create or replace function public.set_teacher_classes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists teacher_classes_updated_at on public.teacher_classes;
create trigger teacher_classes_updated_at
before update on public.teacher_classes
for each row execute function public.set_teacher_classes_updated_at();

alter table public.teacher_classes enable row level security;

drop policy if exists teacher_classes_select_own on public.teacher_classes;
create policy teacher_classes_select_own
  on public.teacher_classes for select
  using (auth.uid() = teacher_id);

drop policy if exists teacher_classes_insert_own on public.teacher_classes;
create policy teacher_classes_insert_own
  on public.teacher_classes for insert
  with check (auth.uid() = teacher_id);

drop policy if exists teacher_classes_update_own on public.teacher_classes;
create policy teacher_classes_update_own
  on public.teacher_classes for update
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

drop policy if exists teacher_classes_delete_own on public.teacher_classes;
create policy teacher_classes_delete_own
  on public.teacher_classes for delete
  using (auth.uid() = teacher_id);

-- Migration: create classes table for Teacher Hub

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  students integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

-- Index for quick lookups per user
CREATE INDEX IF NOT EXISTS classes_user_id_idx ON public.classes (user_id);

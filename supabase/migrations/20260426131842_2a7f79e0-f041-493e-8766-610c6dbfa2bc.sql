ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'wendler531',
  ADD COLUMN IF NOT EXISTS sessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_rule text NOT NULL DEFAULT 'linear',
  ADD COLUMN IF NOT EXISTS default_increment numeric NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
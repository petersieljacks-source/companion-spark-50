
-- Programs table: stores user's 5/3/1 programs (one row per program)
CREATE TABLE public.programs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'Classic 5/3/1',
  round NUMERIC NOT NULL DEFAULT 2.5,
  main_lifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  supp_lifts JSONB NOT NULL DEFAULT '[]'::jsonb,
  week INT NOT NULL DEFAULT 0,
  cycle INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workout logs: one row per logged exercise (or restart marker)
CREATE TABLE public.workout_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE NOT NULL,
  lift_id TEXT NOT NULL,
  lift_name TEXT NOT NULL,
  type TEXT NOT NULL,
  bodyweight BOOLEAN NOT NULL DEFAULT false,
  week INT NOT NULL DEFAULT 0,
  cycle INT NOT NULL DEFAULT 1,
  sets JSONB NOT NULL DEFAULT '[]'::jsonb,
  e1rm NUMERIC,
  overload_earned BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User settings (bodyweight)
CREATE TABLE public.user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  bodyweight NUMERIC NOT NULL DEFAULT 80,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Programs policies
CREATE POLICY "Users view own programs" ON public.programs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own programs" ON public.programs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own programs" ON public.programs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own programs" ON public.programs FOR DELETE USING (auth.uid() = user_id);

-- Workout logs policies
CREATE POLICY "Users view own logs" ON public.workout_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own logs" ON public.workout_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own logs" ON public.workout_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own logs" ON public.workout_logs FOR DELETE USING (auth.uid() = user_id);

-- User settings policies
CREATE POLICY "Users view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Trigger for updated_at on programs
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER programs_touch BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER user_settings_touch BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Helpful indexes
CREATE INDEX programs_user_active_idx ON public.programs(user_id, active);
CREATE INDEX logs_user_program_idx ON public.workout_logs(user_id, program_id, date DESC);

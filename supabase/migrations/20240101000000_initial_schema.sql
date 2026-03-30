-- Create custom enum type for user roles
CREATE TYPE public.user_role AS ENUM ('manager', 'coordinator', 'finance', 'admin');

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'manager'
);

-- Staff table
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Incentives table
CREATE TABLE public.incentives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL,
  given_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_incentives_date ON public.incentives(date);
CREATE INDEX idx_incentives_staff ON public.incentives(staff_id);
CREATE INDEX idx_incentives_given_by ON public.incentives(given_by_user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incentives ENABLE ROW LEVEL SECURITY;

-- ---- Profiles RLS ----

-- Everyone can read all profiles (needed for display names)
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile name (not role)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile (including role changes)
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can insert profiles (for inviting users)
CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR id = auth.uid()
  );

-- ---- Staff RLS ----

-- All authenticated users can view staff
CREATE POLICY "Staff viewable by authenticated users"
  ON public.staff FOR SELECT
  TO authenticated
  USING (true);

-- Managers, coordinators, and admins can insert staff
CREATE POLICY "Managers coordinators admins can insert staff"
  ON public.staff FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('manager', 'coordinator', 'admin')
    )
  );

-- Admins can update staff (active toggle)
CREATE POLICY "Admins can update staff"
  ON public.staff FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---- Incentives RLS ----

-- Managers/coordinators can see their own entries
CREATE POLICY "Managers see own incentives"
  ON public.incentives FOR SELECT
  TO authenticated
  USING (
    given_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('finance', 'admin')
    )
  );

-- Managers/coordinators can insert their own entries
CREATE POLICY "Managers coordinators can insert incentives"
  ON public.incentives FOR INSERT
  TO authenticated
  WITH CHECK (
    given_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('manager', 'coordinator', 'admin')
    )
  );

-- Managers/coordinators can update their own entries, admins can update any
CREATE POLICY "Users can update own incentives or admin any"
  ON public.incentives FOR UPDATE
  TO authenticated
  USING (
    given_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    given_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete incentives
CREATE POLICY "Admins can delete incentives"
  ON public.incentives FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- Trigger: auto-create profile on user signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'manager')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

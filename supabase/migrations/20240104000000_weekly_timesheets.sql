-- Switch from monthly payroll to weekly timesheets (Mon-Sun)
-- Each row in `timesheets` represents a paid week. Absence of a row = due.

CREATE TABLE IF NOT EXISTS public.timesheets (
  week_start DATE PRIMARY KEY,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  notes TEXT
);

ALTER TABLE public.timesheets DROP CONSTRAINT IF EXISTS timesheets_week_start_must_be_monday;
ALTER TABLE public.timesheets ADD CONSTRAINT timesheets_week_start_must_be_monday
  CHECK (EXTRACT(ISODOW FROM week_start) = 1);

ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

-- All authenticated users can SELECT (so dashboard knows paid status).
CREATE POLICY "All authenticated can view timesheets"
  ON public.timesheets FOR SELECT
  TO authenticated
  USING (true);

-- Only admin and finance can mark as paid.
CREATE POLICY "Admin and finance can insert timesheets"
  ON public.timesheets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
    AND paid_by_user_id = auth.uid()
  );

-- Only admin can reverse a payment (un-pay a week).
CREATE POLICY "Admin can delete timesheets"
  ON public.timesheets FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Helper: returns true if the week containing this date has been paid.
CREATE OR REPLACE FUNCTION public.incentive_week_is_paid(incentive_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.timesheets
    WHERE week_start = (incentive_date - ((EXTRACT(ISODOW FROM incentive_date)::int - 1) * INTERVAL '1 day'))::date
  );
$$;

-- Lock incentive edits/deletes for paid weeks.
DROP POLICY IF EXISTS "Users can update own incentives or admin any" ON public.incentives;
CREATE POLICY "Users can update own incentives or admin any"
  ON public.incentives FOR UPDATE
  TO authenticated
  USING (
    NOT public.incentive_week_is_paid(date)
    AND (
      given_by_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
  WITH CHECK (
    NOT public.incentive_week_is_paid(date)
    AND (
      given_by_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete incentives" ON public.incentives;
CREATE POLICY "Admins can delete incentives"
  ON public.incentives FOR DELETE
  TO authenticated
  USING (
    NOT public.incentive_week_is_paid(date)
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RPC: list of weeks with incentives (most recent first), including paid status.
CREATE OR REPLACE FUNCTION public.get_timesheets_summary(weeks_back INT DEFAULT 12)
RETURNS TABLE (
  week_start DATE,
  week_end DATE,
  total_amount NUMERIC,
  total_count BIGINT,
  unique_staff BIGINT,
  status TEXT,
  paid_at TIMESTAMPTZ,
  paid_by_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH weeks AS (
    SELECT DISTINCT
      (i.date - ((EXTRACT(ISODOW FROM i.date)::int - 1) * INTERVAL '1 day'))::date AS week_start
    FROM public.incentives i
    WHERE i.date >= CURRENT_DATE - (weeks_back * 7) * INTERVAL '1 day'
  )
  SELECT
    w.week_start,
    (w.week_start + INTERVAL '6 days')::date AS week_end,
    COALESCE(SUM(i.amount), 0) AS total_amount,
    COUNT(i.id) AS total_count,
    COUNT(DISTINCT i.staff_id) AS unique_staff,
    CASE WHEN t.week_start IS NOT NULL THEN 'paid' ELSE 'due' END AS status,
    t.paid_at,
    p.full_name AS paid_by_name
  FROM weeks w
  LEFT JOIN public.incentives i
    ON i.date >= w.week_start AND i.date < w.week_start + INTERVAL '7 days'
  LEFT JOIN public.timesheets t ON t.week_start = w.week_start
  LEFT JOIN public.profiles p ON p.id = t.paid_by_user_id
  GROUP BY w.week_start, t.week_start, t.paid_at, p.full_name
  ORDER BY w.week_start DESC;
$$;

-- RPC: per-staff breakdown for a single week.
CREATE OR REPLACE FUNCTION public.get_timesheet_breakdown(p_week_start DATE)
RETURNS TABLE (
  staff_id UUID,
  staff_name TEXT,
  phone_number TEXT,
  total_amount NUMERIC,
  incentive_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.phone_number,
    SUM(i.amount) AS total_amount,
    COUNT(i.id) AS incentive_count
  FROM public.incentives i
  JOIN public.staff s ON s.id = i.staff_id
  WHERE i.date >= p_week_start AND i.date < p_week_start + INTERVAL '7 days'
  GROUP BY s.id, s.name, s.phone_number
  ORDER BY s.name;
$$;

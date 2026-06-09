-- Replace whole-week timesheets with per-carer payments.
-- A "timesheet" is now a derived view of incentives + carer_payments
-- for a given Mon-Sun week. Statuses:
--   open    — week not finished yet
--   due     — no carers paid
--   partial — some carers paid, some still owed
--   paid    — every carer with incentives that week is paid

CREATE TABLE IF NOT EXISTS public.carer_payments (
  week_start DATE NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  notes TEXT,
  PRIMARY KEY (week_start, staff_id),
  CONSTRAINT carer_payments_week_start_must_be_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);

CREATE INDEX IF NOT EXISTS idx_carer_payments_staff ON public.carer_payments(staff_id);

-- Migrate existing fully-paid timesheets across, preserving paid_at / paid_by.
INSERT INTO public.carer_payments (week_start, staff_id, amount, paid_at, paid_by_user_id)
SELECT t.week_start, i.staff_id, SUM(i.amount), t.paid_at, t.paid_by_user_id
FROM public.timesheets t
JOIN public.incentives i ON i.date >= t.week_start AND i.date < t.week_start + INTERVAL '7 days'
GROUP BY t.week_start, i.staff_id, t.paid_at, t.paid_by_user_id
ON CONFLICT (week_start, staff_id) DO NOTHING;

-- RLS
ALTER TABLE public.carer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view carer_payments"
  ON public.carer_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and finance can mark paid"
  ON public.carer_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
    AND paid_by_user_id = auth.uid()
  );

CREATE POLICY "Admin and finance can unpay"
  ON public.carer_payments FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
  );

-- Lock helper: an incentive is locked once its (staff, week) is in carer_payments.
CREATE OR REPLACE FUNCTION public.incentive_is_locked(p_staff_id UUID, p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.carer_payments
    WHERE staff_id = p_staff_id
      AND week_start = (p_date - ((EXTRACT(ISODOW FROM p_date)::int - 1) * INTERVAL '1 day'))::date
  );
$$;

DROP POLICY IF EXISTS "Users can update own incentives or admin any" ON public.incentives;
CREATE POLICY "Users can update own incentives or admin any"
  ON public.incentives FOR UPDATE
  TO authenticated
  USING (
    NOT public.incentive_is_locked(staff_id, date)
    AND (
      given_by_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
  WITH CHECK (
    NOT public.incentive_is_locked(staff_id, date)
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
    NOT public.incentive_is_locked(staff_id, date)
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP FUNCTION IF EXISTS public.incentive_week_is_paid(DATE);
DROP TABLE IF EXISTS public.timesheets;

-- RPCs --

DROP FUNCTION IF EXISTS public.get_timesheets_summary(INT);
DROP FUNCTION IF EXISTS public.get_timesheet_breakdown(DATE);

CREATE OR REPLACE FUNCTION public.get_timesheets_summary(weeks_back INT DEFAULT 12)
RETURNS TABLE (
  week_start DATE,
  week_end DATE,
  total_amount NUMERIC,
  total_count BIGINT,
  unique_staff BIGINT,
  paid_amount NUMERIC,
  owed_amount NUMERIC,
  paid_carer_count BIGINT,
  status TEXT,
  last_paid_at TIMESTAMPTZ,
  last_paid_by_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH weeks AS (
    SELECT DISTINCT
      (i.date - ((EXTRACT(ISODOW FROM i.date)::int - 1) * INTERVAL '1 day'))::date AS week_start
    FROM public.incentives i
    WHERE i.date >= CURRENT_DATE - (weeks_back * 7) * INTERVAL '1 day'
  ),
  per_week AS (
    SELECT
      w.week_start,
      (w.week_start + INTERVAL '6 days')::date AS week_end,
      COALESCE(SUM(i.amount), 0)               AS total_amount,
      COUNT(i.id)                              AS total_count,
      COUNT(DISTINCT i.staff_id)               AS unique_staff
    FROM weeks w
    LEFT JOIN public.incentives i
      ON i.date >= w.week_start AND i.date < w.week_start + INTERVAL '7 days'
    GROUP BY w.week_start
  ),
  per_week_paid AS (
    SELECT
      cp.week_start,
      COALESCE(SUM(cp.amount), 0)         AS paid_amount,
      COUNT(DISTINCT cp.staff_id)         AS paid_carer_count,
      MAX(cp.paid_at)                     AS last_paid_at
    FROM public.carer_payments cp
    GROUP BY cp.week_start
  ),
  last_payer AS (
    SELECT DISTINCT ON (cp.week_start)
      cp.week_start, p.full_name
    FROM public.carer_payments cp
    JOIN public.profiles p ON p.id = cp.paid_by_user_id
    ORDER BY cp.week_start, cp.paid_at DESC
  )
  SELECT
    pw.week_start,
    pw.week_end,
    pw.total_amount,
    pw.total_count,
    pw.unique_staff,
    COALESCE(pwp.paid_amount, 0) AS paid_amount,
    GREATEST(pw.total_amount - COALESCE(pwp.paid_amount, 0), 0) AS owed_amount,
    COALESCE(pwp.paid_carer_count, 0) AS paid_carer_count,
    CASE
      WHEN pw.week_end >= CURRENT_DATE THEN 'open'
      WHEN COALESCE(pwp.paid_carer_count, 0) = 0 THEN 'due'
      WHEN pwp.paid_carer_count >= pw.unique_staff THEN 'paid'
      ELSE 'partial'
    END AS status,
    pwp.last_paid_at,
    lp.full_name AS last_paid_by_name
  FROM per_week pw
  LEFT JOIN per_week_paid pwp ON pwp.week_start = pw.week_start
  LEFT JOIN last_payer lp ON lp.week_start = pw.week_start
  ORDER BY pw.week_start DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_timesheet_breakdown(p_week_start DATE)
RETURNS TABLE (
  staff_id UUID,
  staff_name TEXT,
  phone_number TEXT,
  total_amount NUMERIC,
  incentive_count BIGINT,
  is_paid BOOLEAN,
  paid_at TIMESTAMPTZ,
  paid_by_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.phone_number,
    SUM(i.amount) AS total_amount,
    COUNT(i.id) AS incentive_count,
    (cp.staff_id IS NOT NULL) AS is_paid,
    cp.paid_at,
    p.full_name AS paid_by_name
  FROM public.incentives i
  JOIN public.staff s ON s.id = i.staff_id
  LEFT JOIN public.carer_payments cp
    ON cp.week_start = p_week_start AND cp.staff_id = s.id
  LEFT JOIN public.profiles p ON p.id = cp.paid_by_user_id
  WHERE i.date >= p_week_start AND i.date < p_week_start + INTERVAL '7 days'
  GROUP BY s.id, s.name, s.phone_number, cp.staff_id, cp.paid_at, p.full_name
  ORDER BY s.name;
$$;

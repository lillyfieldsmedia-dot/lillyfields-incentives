-- Add a third status: 'open' for weeks still in progress (Sunday hasn't passed yet).
-- These can't be marked paid because the week isn't complete.
-- The week becomes 'due' the following Monday (when Sunday < CURRENT_DATE).

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
    CASE
      WHEN t.week_start IS NOT NULL THEN 'paid'
      WHEN (w.week_start + INTERVAL '6 days')::date >= CURRENT_DATE THEN 'open'
      ELSE 'due'
    END AS status,
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

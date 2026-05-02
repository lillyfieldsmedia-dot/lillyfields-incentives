-- Allow all authenticated users (managers, coordinators, finance, admin) to
-- read every incentive, so coordinators can see what each other are offering
-- and avoid double-incentivising the same shift.
-- Edit/delete permissions remain restricted via the existing UPDATE/DELETE policies.

DROP POLICY IF EXISTS "Managers see own incentives" ON public.incentives;
CREATE POLICY "All authenticated can view incentives"
  ON public.incentives FOR SELECT
  TO authenticated
  USING (true);

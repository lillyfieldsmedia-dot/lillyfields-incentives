-- Add area enum
CREATE TYPE public.incentive_area AS ENUM ('waterlooville', 'petersfield', 'chichester', 'farnborough');

-- Add shift enum
CREATE TYPE public.incentive_shift AS ENUM ('morning', 'evening', 'weekend');

-- Add columns to incentives table
ALTER TABLE public.incentives ADD COLUMN area public.incentive_area;
ALTER TABLE public.incentives ADD COLUMN shift public.incentive_shift;

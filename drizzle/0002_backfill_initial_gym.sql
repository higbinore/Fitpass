-- Phase 0002: assign the approved launch tenant and backfill legacy rows.
-- No existing plan field is changed; only the newly added gym_id/updated_at
-- columns are populated. Drizzle's PostgreSQL migrator runs this atomically.
-- Rollback: use the immutable independent backup and restore to a NEW database.
-- Do not set gym_id back to NULL in place after tenant-scoped writes begin.
DO $$
DECLARE
  launch_gym_id uuid;
  expected_plan_count integer;
  matched_plan_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans'
      AND column_name = 'gym_id' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Phase 0002 appears already applied; inspect public.__drizzle_migrations and do not replay manually';
  END IF;

  SELECT count(*) INTO expected_plan_count FROM public.plans;
  SELECT count(*) INTO matched_plan_count
  FROM public.plans
  WHERE id IN (
    'cedb6309-8a1c-4dc4-b95c-6ff28e2877a0'::uuid,
    '9cc70b0f-3445-4232-995f-0fde36c36c3c'::uuid,
    'd4710408-7014-4c07-be21-18ef3d5e8a64'::uuid,
    '4df6abf0-c63a-44f0-bbfe-28273282fc16'::uuid
  );
  IF expected_plan_count <> 4 OR matched_plan_count <> 4 THEN
    RAISE EXCEPTION 'Expected exactly the four owner-confirmed launch plans; observed % plans and % approved IDs. Stop for source review.', expected_plan_count, matched_plan_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('cedb6309-8a1c-4dc4-b95c-6ff28e2877a0'::uuid, 'Day Pass'),
      ('9cc70b0f-3445-4232-995f-0fde36c36c3c'::uuid, 'Monthly'),
      ('d4710408-7014-4c07-be21-18ef3d5e8a64'::uuid, '3 Months'),
      ('4df6abf0-c63a-44f0-bbfe-28273282fc16'::uuid, 'Annual')
    ) AS approved(id, name)
    LEFT JOIN public.plans p ON p.id = approved.id
    WHERE p.id IS NULL OR p.name <> approved.name
  ) THEN
    RAISE EXCEPTION 'An approved plan ID/name pair does not match the reviewed source; stop without changing plan rows';
  END IF;

  INSERT INTO public.gyms (
    slug, name, status, contact_phone, contact_email, location,
    description, opening_hours, max_daily_checkins
  ) VALUES (
    'fitpass-elite-fitness-club',
    'FITPASS ELITE FITNESS CLUB',
    'active',
    '+234 800 000 0000',
    'hello@fitpasselite.example',
    'University of Benin, Ugbowo Campus, Ugbowo, Benin City, Edo State, Nigeria',
    'A modern, fully equipped fitness club near the University of Benin, Ugbowo. Strength zone, cardio floor, studio space and friendly coaching, with flexible day passes and monthly plans.',
    'Monday to Saturday 5:30am to 9:00pm; Sunday closed',
    1
  ) ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO STRICT launch_gym_id
  FROM public.gyms WHERE slug = 'fitpass-elite-fitness-club';

  -- The owner confirmed these four plans belong to the launch gym. Preserve
  -- each ID, name, duration, kobo price, description, flags, order and created_at.
  UPDATE public.plans SET gym_id = launch_gym_id
  WHERE id IN (
    'cedb6309-8a1c-4dc4-b95c-6ff28e2877a0'::uuid,
    '9cc70b0f-3445-4232-995f-0fde36c36c3c'::uuid,
    'd4710408-7014-4c07-be21-18ef3d5e8a64'::uuid,
    '4df6abf0-c63a-44f0-bbfe-28273282fc16'::uuid
  );
  UPDATE public.plans SET updated_at = created_at WHERE updated_at IS NULL;

  -- The project owner approved the launch gym as the deterministic tenant for
  -- any legacy FitPass business rows in this single-gym launch database.
  UPDATE public.members SET gym_id = launch_gym_id WHERE gym_id IS NULL;
  UPDATE public.checkins SET gym_id = launch_gym_id WHERE gym_id IS NULL;
  UPDATE public.subscriptions SET gym_id = launch_gym_id WHERE gym_id IS NULL;
  UPDATE public.payments SET gym_id = launch_gym_id WHERE gym_id IS NULL;

  -- Existing payment integrations were Paystack-only; the new discriminator
  -- records that legacy mode without changing amounts, references or status.
  UPDATE public.subscriptions SET payment_mode = 'paystack' WHERE payment_mode IS NULL;
  UPDATE public.payments SET payment_mode = 'paystack' WHERE payment_mode IS NULL;

  IF EXISTS (
    SELECT 1 FROM public.plans WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.members WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.checkins WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.subscriptions WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.payments WHERE gym_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant backfill left NULL gym_id values; transaction must roll back';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE public.plans ALTER COLUMN gym_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.plans ALTER COLUMN updated_at SET DEFAULT now();
--> statement-breakpoint
ALTER TABLE public.plans ALTER COLUMN updated_at SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.members ALTER COLUMN gym_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.checkins ALTER COLUMN gym_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.subscriptions ALTER COLUMN gym_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.subscriptions ALTER COLUMN payment_mode SET DEFAULT 'paystack';
--> statement-breakpoint
ALTER TABLE public.subscriptions ALTER COLUMN payment_mode SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.payments ALTER COLUMN gym_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.payments ALTER COLUMN payment_mode SET DEFAULT 'paystack';
--> statement-breakpoint
ALTER TABLE public.payments ALTER COLUMN payment_mode SET NOT NULL;
--> statement-breakpoint
UPDATE public.gyms SET max_daily_checkins = 1 WHERE max_daily_checkins IS NULL;
--> statement-breakpoint
ALTER TABLE public.gyms ALTER COLUMN max_daily_checkins SET DEFAULT 1;
--> statement-breakpoint
ALTER TABLE public.gyms ALTER COLUMN max_daily_checkins SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.gyms ADD CONSTRAINT gyms_max_daily_checkins_valid CHECK (max_daily_checkins BETWEEN 1 AND 20) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.gyms VALIDATE CONSTRAINT gyms_max_daily_checkins_valid;

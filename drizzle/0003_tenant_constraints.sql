-- Phase 0003: validate tenant relationships and replace global uniqueness.
-- New constraints/indexes are installed and validated before old equivalents
-- are removed. Existing checkins.checked_in_by -> members.id is deliberately
-- retained; checked_in_by_membership_id is the new tenant-aware actor field.
-- Drizzle's PostgreSQL migrator runs this migration transactionally.
-- Rollback: do not drop new tenant constraints in place; recover from the
-- immutable verified backup into a NEW database and reconcile before cutover.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.members WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.checkins WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.subscriptions WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.payments WHERE gym_id IS NULL
    UNION ALL SELECT 1 FROM public.plans WHERE gym_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant constraint phase blocked: NULL gym_id remains';
  END IF;
  IF EXISTS (
    SELECT gym_id, name FROM public.plans GROUP BY gym_id, name HAVING count(*) > 1
    UNION ALL
    SELECT gym_id, membership_code FROM public.members GROUP BY gym_id, membership_code HAVING count(*) > 1
    UNION ALL
    SELECT gym_id, user_id FROM public.members GROUP BY gym_id, user_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Tenant-scoped duplicate check failed; preserve existing global constraints and investigate';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE public.members ADD CONSTRAINT members_gym_id_unique UNIQUE (gym_id, id);
--> statement-breakpoint
ALTER TABLE public.plans ADD CONSTRAINT plans_gym_id_unique UNIQUE (gym_id, id);
--> statement-breakpoint
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_gym_id_unique UNIQUE (gym_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX members_gym_user_unique ON public.members (gym_id, user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX members_gym_code_unique ON public.members (gym_id, membership_code);
--> statement-breakpoint
CREATE UNIQUE INDEX plans_gym_name_unique ON public.plans (gym_id, name);
--> statement-breakpoint
CREATE UNIQUE INDEX subscriptions_one_active_per_gym_member ON public.subscriptions (gym_id, member_id) WHERE status = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX subscriptions_one_pending_per_member ON public.subscriptions (gym_id, member_id) WHERE status = 'pending';
--> statement-breakpoint

ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_tenant_valid CHECK (status in ('pending', 'active', 'expired', 'cancelled')) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_payment_mode_valid CHECK (payment_mode in ('paystack', 'demo')) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_mode_valid CHECK (payment_mode in ('paystack', 'demo')) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_status_tenant_valid;
--> statement-breakpoint
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_payment_mode_valid;
--> statement-breakpoint
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_payment_mode_valid;
--> statement-breakpoint

ALTER TABLE public.members ADD CONSTRAINT members_gym_id_gyms_id_fk FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_gym_member_fk FOREIGN KEY (gym_id, member_id) REFERENCES public.members(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_gym_plan_fk FOREIGN KEY (gym_id, plan_id) REFERENCES public.plans(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.checkins ADD CONSTRAINT checkins_gym_member_fk FOREIGN KEY (gym_id, member_id) REFERENCES public.members(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.checkins ADD CONSTRAINT checkins_gym_subscription_fk FOREIGN KEY (gym_id, subscription_id) REFERENCES public.subscriptions(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.checkins ADD CONSTRAINT checkins_gym_actor_fk FOREIGN KEY (gym_id, checked_in_by_membership_id) REFERENCES public.gym_memberships(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payments ADD CONSTRAINT payments_gym_member_fk FOREIGN KEY (gym_id, member_id) REFERENCES public.members(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payments ADD CONSTRAINT payments_gym_plan_fk FOREIGN KEY (gym_id, plan_id) REFERENCES public.plans(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.payments ADD CONSTRAINT payments_gym_subscription_fk FOREIGN KEY (gym_id, subscription_id) REFERENCES public.subscriptions(gym_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE public.plans ADD CONSTRAINT plans_gym_id_gyms_id_fk FOREIGN KEY (gym_id) REFERENCES public.gyms(id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint

ALTER TABLE public.members VALIDATE CONSTRAINT members_gym_id_gyms_id_fk;
--> statement-breakpoint
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_gym_member_fk;
--> statement-breakpoint
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_gym_plan_fk;
--> statement-breakpoint
ALTER TABLE public.checkins VALIDATE CONSTRAINT checkins_gym_member_fk;
--> statement-breakpoint
ALTER TABLE public.checkins VALIDATE CONSTRAINT checkins_gym_subscription_fk;
--> statement-breakpoint
ALTER TABLE public.checkins VALIDATE CONSTRAINT checkins_gym_actor_fk;
--> statement-breakpoint
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_gym_member_fk;
--> statement-breakpoint
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_gym_plan_fk;
--> statement-breakpoint
ALTER TABLE public.payments VALIDATE CONSTRAINT payments_gym_subscription_fk;
--> statement-breakpoint
ALTER TABLE public.plans VALIDATE CONSTRAINT plans_gym_id_gyms_id_fk;
--> statement-breakpoint

-- Only after same-gym foreign keys and scoped unique indexes validate:
ALTER TABLE public.members DROP CONSTRAINT members_membership_code_unique;
--> statement-breakpoint
ALTER TABLE public.members DROP CONSTRAINT members_user_id_unique;
--> statement-breakpoint
DROP INDEX public.plans_name_unique;
--> statement-breakpoint
DROP INDEX public.subscriptions_one_active_per_member;
--> statement-breakpoint
ALTER INDEX public.subscriptions_one_active_per_gym_member RENAME TO subscriptions_one_active_per_member;
--> statement-breakpoint
ALTER TABLE public.checkins DROP CONSTRAINT checkins_member_id_members_id_fk;
--> statement-breakpoint
ALTER TABLE public.checkins DROP CONSTRAINT checkins_subscription_id_subscriptions_id_fk;
--> statement-breakpoint
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_member_id_members_id_fk;
--> statement-breakpoint
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_plan_id_plans_id_fk;
--> statement-breakpoint
ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_valid;
--> statement-breakpoint
ALTER TABLE public.subscriptions RENAME CONSTRAINT subscriptions_status_tenant_valid TO subscriptions_status_valid;
--> statement-breakpoint
ALTER TABLE public.payments DROP CONSTRAINT payments_member_id_members_id_fk;
--> statement-breakpoint
ALTER TABLE public.payments DROP CONSTRAINT payments_plan_id_plans_id_fk;
--> statement-breakpoint
ALTER TABLE public.payments DROP CONSTRAINT payments_subscription_id_subscriptions_id_fk;
--> statement-breakpoint

CREATE INDEX members_gym_role_idx ON public.members (gym_id, role);
--> statement-breakpoint
CREATE INDEX checkins_gym_member_created_idx ON public.checkins (gym_id, member_id, created_at);
--> statement-breakpoint
CREATE INDEX checkins_gym_created_idx ON public.checkins (gym_id, created_at);
--> statement-breakpoint
CREATE INDEX subscriptions_gym_member_status_idx ON public.subscriptions (gym_id, member_id, status);
--> statement-breakpoint
CREATE INDEX subscriptions_gym_expires_idx ON public.subscriptions (gym_id, expires_at);
--> statement-breakpoint
CREATE INDEX payments_gym_member_created_idx ON public.payments (gym_id, member_id, created_at);
--> statement-breakpoint
CREATE INDEX plans_gym_active_sort_idx ON public.plans (gym_id, is_active, sort_order);

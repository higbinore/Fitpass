-- Phase 0001: additive foundation only; no legacy constraints or indexes are dropped.
-- Drizzle's PostgreSQL migrator executes each migration transactionally.
-- Rollback: restore the immutable verified backup into a NEW disposable database;
-- do not reverse this migration in place because application writes may follow.
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid,
	"actor_user_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_name" text NOT NULL,
	"requested_slug" text NOT NULL,
	"applicant_name" text NOT NULL,
	"applicant_email" text NOT NULL,
	"preferred_package_id" uuid,
	"phone" text,
	"location" text,
	"logo_url" text,
	"facility_photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_applications_status_valid" CHECK ("gym_applications"."status" in ('pending', 'approved', 'rejected', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE "gym_invitation_roles" (
	"invitation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_invitation_roles_pk" UNIQUE("invitation_id","role"),
	CONSTRAINT "gym_invitation_roles_valid" CHECK ("gym_invitation_roles"."role" in ('gym_owner', 'gym_desk_staff', 'gym_member'))
);
--> statement-breakpoint
CREATE TABLE "gym_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_membership_id" uuid,
	"invited_by_platform_admin_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "gym_invitations_inviter_valid" CHECK (("gym_invitations"."invited_by_membership_id" is not null and "gym_invitations"."invited_by_platform_admin_user_id" is null) or ("gym_invitations"."invited_by_membership_id" is null and "gym_invitations"."invited_by_platform_admin_user_id" is not null)),
	CONSTRAINT "gym_invitations_status_valid" CHECK ("gym_invitations"."status" in ('pending', 'accepted', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "gym_membership_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by_membership_id" uuid,
	"granted_by_platform_admin_user_id" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_membership_id" uuid,
	"revoked_by_platform_admin_user_id" text,
	CONSTRAINT "gym_membership_roles_role_valid" CHECK ("gym_membership_roles"."role" in ('gym_owner', 'gym_desk_staff', 'gym_member')),
	CONSTRAINT "gym_membership_roles_grant_actor_valid" CHECK (("gym_membership_roles"."granted_by_membership_id" is not null and "gym_membership_roles"."granted_by_platform_admin_user_id" is null) or ("gym_membership_roles"."granted_by_membership_id" is null and "gym_membership_roles"."granted_by_platform_admin_user_id" is not null)),
	CONSTRAINT "gym_membership_roles_revoke_actor_valid" CHECK (("gym_membership_roles"."revoked_at" is null and "gym_membership_roles"."revoked_by_membership_id" is null and "gym_membership_roles"."revoked_by_platform_admin_user_id" is null) or ("gym_membership_roles"."revoked_at" is not null and (("gym_membership_roles"."revoked_by_membership_id" is not null and "gym_membership_roles"."revoked_by_platform_admin_user_id" is null) or ("gym_membership_roles"."revoked_by_membership_id" is null and "gym_membership_roles"."revoked_by_platform_admin_user_id" is not null))))
);
--> statement-breakpoint
CREATE TABLE "gym_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "gym_memberships_gym_user_unique" UNIQUE("gym_id","user_id"),
	CONSTRAINT "gym_memberships_gym_id_unique" UNIQUE("gym_id","id"),
	CONSTRAINT "gym_memberships_status_valid" CHECK ("gym_memberships"."status" in ('active', 'suspended', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "gym_onboarding" (
	"gym_id" uuid PRIMARY KEY NOT NULL,
	"preferred_package_id" uuid NOT NULL,
	"trial_activated_at" timestamp with time zone,
	"trial_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_onboarding_trial_dates_valid" CHECK (("gym_onboarding"."trial_activated_at" is null and "gym_onboarding"."trial_expires_at" is null) or ("gym_onboarding"."trial_activated_at" is not null and "gym_onboarding"."trial_expires_at" is not null and "gym_onboarding"."trial_expires_at" > "gym_onboarding"."trial_activated_at"))
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"contact_phone" text,
	"contact_email" text,
	"location" text,
	"description" text,
	"opening_hours" text,
	"max_daily_checkins" integer,
	"latitude" double precision,
	"longitude" double precision,
	"location_verified_at" timestamp with time zone,
	"location_verified_by_user_id" text,
	"location_source" text,
	"logo_url" text,
	"facility_photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gyms_id_status_unique" UNIQUE("id","status"),
	CONSTRAINT "gyms_status_valid" CHECK ("gyms"."status" in ('active', 'suspended', 'archived')),
	CONSTRAINT "gyms_coordinates_pair_valid" CHECK (("gyms"."latitude" is null and "gyms"."longitude" is null and "gyms"."location_verified_at" is null) or ("gyms"."latitude" between -90 and 90 and "gyms"."longitude" between -180 and 180 and "gyms"."location_verified_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "payment_reference_registry" (
	"reference" text PRIMARY KEY NOT NULL,
	"payment_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reference_type_valid" CHECK ("payment_reference_registry"."payment_type" in ('gym', 'platform'))
);
--> statement-breakpoint
CREATE TABLE "paystack_webhook_events" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"payment_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paystack_webhook_events_reference_unique" UNIQUE("reference"),
	CONSTRAINT "paystack_webhook_payment_type_valid" CHECK ("paystack_webhook_events"."payment_type" in ('gym', 'platform'))
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"suspended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_kobo" integer NOT NULL,
	"billing_interval" text DEFAULT 'month' NOT NULL,
	"active_member_limit" integer NOT NULL,
	"admin_account_limit" integer NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_package_values_positive" CHECK ("platform_packages"."price_kobo" > 0 and "platform_packages"."active_member_limit" > 0 and "platform_packages"."admin_account_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "platform_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"platform_subscription_id" uuid NOT NULL,
	"platform_package_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"paystack_transaction_id" text,
	"payment_mode" text DEFAULT 'paystack' NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_payments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "platform_payments_paystack_transaction_id_unique" UNIQUE("paystack_transaction_id"),
	CONSTRAINT "platform_payments_status_valid" CHECK ("platform_payments"."status" in ('pending', 'paid', 'failed', 'abandoned')),
	CONSTRAINT "platform_payments_payment_mode_valid" CHECK ("platform_payments"."payment_mode" in ('paystack', 'demo')),
	CONSTRAINT "platform_payments_amount_positive" CHECK ("platform_payments"."amount_kobo" > 0)
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"payment_mode" text DEFAULT 'paystack' NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_subscriptions_gym_id_unique" UNIQUE("gym_id","id"),
	CONSTRAINT "platform_subscription_status_valid" CHECK ("platform_subscriptions"."status" in ('pending_payment', 'trialing', 'active', 'past_due', 'cancelled', 'expired')),
	CONSTRAINT "platform_subscription_payment_mode_valid" CHECK ("platform_subscriptions"."payment_mode" in ('paystack', 'demo'))
);
-- Additive only. Existing business rows remain in place and all new tenant columns are nullable until phase 0002 backfills them.
ALTER TABLE "members" ADD COLUMN "gym_id" uuid;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "anonymized_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "gym_id" uuid;
--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "checked_in_by_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "gym_id" uuid;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_mode" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gym_id" uuid;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_mode" text;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "gym_id" uuid;
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "updated_at" timestamp with time zone;

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_applications" ADD CONSTRAINT "gym_applications_preferred_package_id_platform_packages_id_fk" FOREIGN KEY ("preferred_package_id") REFERENCES "public"."platform_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_applications" ADD CONSTRAINT "gym_applications_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_invitation_roles" ADD CONSTRAINT "gym_invitation_roles_invitation_id_gym_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."gym_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_invitations" ADD CONSTRAINT "gym_invitations_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_invitations" ADD CONSTRAINT "gym_invitations_invited_by_platform_admin_user_id_platform_admins_user_id_fk" FOREIGN KEY ("invited_by_platform_admin_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_invitations" ADD CONSTRAINT "gym_invitations_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_invitations" ADD CONSTRAINT "gym_invitations_inviter_membership_fk" FOREIGN KEY ("gym_id","invited_by_membership_id") REFERENCES "public"."gym_memberships"("gym_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_membership_roles" ADD CONSTRAINT "gym_membership_roles_granted_by_platform_admin_user_id_platform_admins_user_id_fk" FOREIGN KEY ("granted_by_platform_admin_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_membership_roles" ADD CONSTRAINT "gym_membership_roles_revoked_by_platform_admin_user_id_platform_admins_user_id_fk" FOREIGN KEY ("revoked_by_platform_admin_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_membership_roles" ADD CONSTRAINT "gym_membership_roles_membership_fk" FOREIGN KEY ("gym_id","membership_id") REFERENCES "public"."gym_memberships"("gym_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_membership_roles" ADD CONSTRAINT "gym_membership_roles_grantor_fk" FOREIGN KEY ("gym_id","granted_by_membership_id") REFERENCES "public"."gym_memberships"("gym_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_membership_roles" ADD CONSTRAINT "gym_membership_roles_revoker_fk" FOREIGN KEY ("gym_id","revoked_by_membership_id") REFERENCES "public"."gym_memberships"("gym_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_onboarding" ADD CONSTRAINT "gym_onboarding_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_onboarding" ADD CONSTRAINT "gym_onboarding_preferred_package_id_platform_packages_id_fk" FOREIGN KEY ("preferred_package_id") REFERENCES "public"."platform_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_location_verified_by_user_id_platform_admins_user_id_fk" FOREIGN KEY ("location_verified_by_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_platform_package_id_platform_packages_id_fk" FOREIGN KEY ("platform_package_id") REFERENCES "public"."platform_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_payments" ADD CONSTRAINT "platform_payments_gym_subscription_fk" FOREIGN KEY ("gym_id","platform_subscription_id") REFERENCES "public"."platform_subscriptions"("gym_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_platform_admins_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."platform_admins"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_package_id_platform_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."platform_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_gym_created_idx" ON "audit_events" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "gym_applications_status_created_idx" ON "gym_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gym_invitations_pending_email_unique" ON "gym_invitations" USING btree ("gym_id","email") WHERE "gym_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "gym_invitations_expiry_idx" ON "gym_invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gym_membership_roles_active_unique" ON "gym_membership_roles" USING btree ("gym_id","membership_id","role") WHERE "gym_membership_roles"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "gym_membership_roles_active_idx" ON "gym_membership_roles" USING btree ("gym_id","membership_id","role") WHERE "gym_membership_roles"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "gym_memberships_user_status_idx" ON "gym_memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "gym_onboarding_package_idx" ON "gym_onboarding" USING btree ("preferred_package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_slug_unique" ON "gyms" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_packages_name_unique" ON "platform_packages" USING btree ("name");--> statement-breakpoint
CREATE INDEX "platform_payments_gym_created_idx" ON "platform_payments" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_subscriptions_one_current_per_gym" ON "platform_subscriptions" USING btree ("gym_id") WHERE "platform_subscriptions"."status" in ('pending_payment', 'trialing', 'active', 'past_due');--> statement-breakpoint
CREATE INDEX "platform_subscriptions_status_period_idx" ON "platform_subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint

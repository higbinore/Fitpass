import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// Better Auth's default Drizzle adapter tables.
export const authUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const authAccounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const authVerifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const gyms = pgTable(
  "gyms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    location: text("location"),
    description: text("description"),
    openingHours: text("opening_hours"),
    maxDailyCheckins: integer("max_daily_checkins").notNull().default(1),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    locationVerifiedAt: timestamp("location_verified_at", { withTimezone: true }),
    locationVerifiedByUserId: text("location_verified_by_user_id").references(() => platformAdmins.userId, { onDelete: "set null" }),
    locationSource: text("location_source"),
    logoUrl: text("logo_url"),
    facilityPhotoUrls: jsonb("facility_photo_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("gyms_slug_unique").on(t.slug),
    unique("gyms_id_status_unique").on(t.id, t.status),
    check("gyms_status_valid", sql`${t.status} in ('active', 'suspended', 'archived')`),
    check("gyms_max_daily_checkins_valid", sql`${t.maxDailyCheckins} between 1 and 20`),
    check("gyms_coordinates_pair_valid", sql`(${t.latitude} is null and ${t.longitude} is null and ${t.locationVerifiedAt} is null) or (${t.latitude} between -90 and 90 and ${t.longitude} between -180 and 180 and ${t.locationVerifiedAt} is not null)`),
  ],
);

export type GymRole = "gym_owner" | "gym_desk_staff" | "gym_member";
export type MembershipStatus = "active" | "suspended" | "revoked";

export const platformAdmins = pgTable("platform_admins", {
  userId: text("user_id").primaryKey().references(() => authUsers.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  createdByUserId: text("created_by_user_id"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
});

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<{ enabled: boolean }>().notNull(),
  updatedByUserId: text("updated_by_user_id").notNull().references(() => platformAdmins.userId, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const gymMemberships = pgTable(
  "gym_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gyms.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "restrict" }),
    status: text("status").$type<MembershipStatus>().notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    unique("gym_memberships_gym_user_unique").on(t.gymId, t.userId),
    unique("gym_memberships_gym_id_unique").on(t.gymId, t.id),
    index("gym_memberships_user_status_idx").on(t.userId, t.status),
    check("gym_memberships_status_valid", sql`${t.status} in ('active', 'suspended', 'revoked')`),
  ],
);

export const gymMembershipRoles = pgTable(
  "gym_membership_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    role: text("role").$type<GymRole>().notNull(),
    grantedByMembershipId: uuid("granted_by_membership_id"),
    grantedByPlatformAdminUserId: text("granted_by_platform_admin_user_id").references(() => platformAdmins.userId, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByMembershipId: uuid("revoked_by_membership_id"),
    revokedByPlatformAdminUserId: text("revoked_by_platform_admin_user_id").references(() => platformAdmins.userId, { onDelete: "restrict" }),
  },
  (t) => [
    foreignKey({ columns: [t.gymId, t.membershipId], foreignColumns: [gymMemberships.gymId, gymMemberships.id], name: "gym_membership_roles_membership_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.gymId, t.grantedByMembershipId], foreignColumns: [gymMemberships.gymId, gymMemberships.id], name: "gym_membership_roles_grantor_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.gymId, t.revokedByMembershipId], foreignColumns: [gymMemberships.gymId, gymMemberships.id], name: "gym_membership_roles_revoker_fk" }).onDelete("restrict"),
    uniqueIndex("gym_membership_roles_active_unique").on(t.gymId, t.membershipId, t.role).where(sql`${t.revokedAt} is null`),
    index("gym_membership_roles_active_idx").on(t.gymId, t.membershipId, t.role).where(sql`${t.revokedAt} is null`),
    check("gym_membership_roles_role_valid", sql`${t.role} in ('gym_owner', 'gym_desk_staff', 'gym_member')`),
    check("gym_membership_roles_grant_actor_valid", sql`(${t.grantedByMembershipId} is not null and ${t.grantedByPlatformAdminUserId} is null) or (${t.grantedByMembershipId} is null and ${t.grantedByPlatformAdminUserId} is not null)`),
    check("gym_membership_roles_revoke_actor_valid", sql`(${t.revokedAt} is null and ${t.revokedByMembershipId} is null and ${t.revokedByPlatformAdminUserId} is null) or (${t.revokedAt} is not null and ((${t.revokedByMembershipId} is not null and ${t.revokedByPlatformAdminUserId} is null) or (${t.revokedByMembershipId} is null and ${t.revokedByPlatformAdminUserId} is not null)))`),
  ],
);

export const platformPackages = pgTable(
  "platform_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    priceKobo: integer("price_kobo").notNull(),
    billingInterval: text("billing_interval").notNull().default("month"),
    activeMemberLimit: integer("active_member_limit").notNull(),
    adminAccountLimit: integer("admin_account_limit").notNull(),
    features: jsonb("features").$type<Record<string, boolean>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("platform_packages_name_unique").on(t.name), check("platform_package_values_positive", sql`${t.priceKobo} > 0 and ${t.activeMemberLimit} > 0 and ${t.adminAccountLimit} > 0`)],
);

export const gymApplications = pgTable(
  "gym_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymName: text("gym_name").notNull(),
    requestedSlug: text("requested_slug").notNull(),
    applicantName: text("applicant_name").notNull(),
    applicantEmail: text("applicant_email").notNull(),
    preferredPackageId: uuid("preferred_package_id").references(() => platformPackages.id, { onDelete: "restrict" }),
    phone: text("phone"),
    location: text("location"),
    logoUrl: text("logo_url"),
    facilityPhotoUrls: jsonb("facility_photo_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("gym_applications_status_created_idx").on(t.status, t.createdAt), check("gym_applications_status_valid", sql`${t.status} in ('pending', 'approved', 'rejected', 'withdrawn')`)],
);

/** Holds onboarding package choice and the one-time first-owner trial lifecycle. */
export const gymOnboarding = pgTable(
  "gym_onboarding",
  {
    gymId: uuid("gym_id").primaryKey().references(() => gyms.id, { onDelete: "restrict" }),
    preferredPackageId: uuid("preferred_package_id").notNull().references(() => platformPackages.id, { onDelete: "restrict" }),
    trialActivatedAt: timestamp("trial_activated_at", { withTimezone: true }),
    trialExpiresAt: timestamp("trial_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("gym_onboarding_package_idx").on(t.preferredPackageId),
    check("gym_onboarding_trial_dates_valid", sql`(${t.trialActivatedAt} is null and ${t.trialExpiresAt} is null) or (${t.trialActivatedAt} is not null and ${t.trialExpiresAt} is not null and ${t.trialExpiresAt} > ${t.trialActivatedAt})`),
  ],
);

export const gymInvitations = pgTable(
  "gym_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gyms.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByMembershipId: uuid("invited_by_membership_id"),
    invitedByPlatformAdminUserId: text("invited_by_platform_admin_user_id").references(() => platformAdmins.userId, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedByUserId: text("accepted_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.gymId, t.invitedByMembershipId], foreignColumns: [gymMemberships.gymId, gymMemberships.id], name: "gym_invitations_inviter_membership_fk" }).onDelete("restrict"),
    uniqueIndex("gym_invitations_pending_email_unique").on(t.gymId, t.email).where(sql`${t.status} = 'pending'`),
    index("gym_invitations_expiry_idx").on(t.expiresAt),
    check("gym_invitations_inviter_valid", sql`(${t.invitedByMembershipId} is not null and ${t.invitedByPlatformAdminUserId} is null) or (${t.invitedByMembershipId} is null and ${t.invitedByPlatformAdminUserId} is not null)`),
    check("gym_invitations_status_valid", sql`${t.status} in ('pending', 'accepted', 'revoked', 'expired')`),
  ],
);

export const gymInvitationRoles = pgTable(
  "gym_invitation_roles",
  {
    invitationId: uuid("invitation_id").notNull().references(() => gymInvitations.id, { onDelete: "cascade" }),
    role: text("role").$type<GymRole>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("gym_invitation_roles_pk").on(t.invitationId, t.role), check("gym_invitation_roles_valid", sql`${t.role} in ('gym_owner', 'gym_desk_staff', 'gym_member')`)],
);

// Existing tables gain gym_id in the reviewed migration. Nullability here is
// temporary for the data-preserving rollout; application code must require it.
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gyms.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    durationDays: integer("duration_days").notNull(),
    priceKobo: integer("price_kobo").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("plans_gym_id_unique").on(t.gymId, t.id),
    uniqueIndex("plans_gym_name_unique").on(t.gymId, t.name),
    index("plans_gym_active_sort_idx").on(t.gymId, t.isActive, t.sortOrder),
    check("plans_duration_days_positive", sql`${t.durationDays} > 0`),
    check("plans_price_kobo_positive", sql`${t.priceKobo} > 0`),
  ],
);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gyms.id, { onDelete: "restrict" }),
    // Legacy text identity is retained until a separate verified-account linking flow is reviewed.
    userId: text("user_id").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("member"),
    membershipCode: text("membership_code").notNull(),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("members_gym_id_unique").on(t.gymId, t.id),
    uniqueIndex("members_gym_user_unique").on(t.gymId, t.userId),
    uniqueIndex("members_gym_code_unique").on(t.gymId, t.membershipCode),
    index("members_gym_role_idx").on(t.gymId, t.role),
    check("members_role_valid", sql`${t.role} in ('member', 'front_desk', 'owner')`),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull(),
    memberId: uuid("member_id").notNull(),
    planId: uuid("plan_id").notNull(),
    status: text("status").notNull().default("active"),
    paymentMode: text("payment_mode").notNull().default("paystack"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.gymId, t.memberId], foreignColumns: [members.gymId, members.id], name: "subscriptions_gym_member_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.gymId, t.planId], foreignColumns: [plans.gymId, plans.id], name: "subscriptions_gym_plan_fk" }).onDelete("restrict"),
    unique("subscriptions_gym_id_unique").on(t.gymId, t.id),
    uniqueIndex("subscriptions_one_pending_per_member").on(t.gymId, t.memberId).where(sql`${t.status} = 'pending'`),
    uniqueIndex("subscriptions_one_active_per_member").on(t.gymId, t.memberId).where(sql`${t.status} = 'active'`),
    index("subscriptions_gym_member_status_idx").on(t.gymId, t.memberId, t.status),
    index("subscriptions_gym_expires_idx").on(t.gymId, t.expiresAt),
    check("subscriptions_status_valid", sql`${t.status} in ('pending', 'active', 'expired', 'cancelled')`),
    check("subscriptions_payment_mode_valid", sql`${t.paymentMode} in ('paystack', 'demo')`),
    check("subscriptions_period_valid", sql`${t.expiresAt} > ${t.startsAt}`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull(),
    memberId: uuid("member_id").notNull(),
    planId: uuid("plan_id").notNull(),
    subscriptionId: uuid("subscription_id"),
    reference: text("reference").notNull().unique(),
    paymentMode: text("payment_mode").notNull().default("paystack"),
    amountKobo: integer("amount_kobo").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("pending"),
    paystackTransactionId: text("paystack_transaction_id").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    webhookPayload: jsonb("webhook_payload"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.gymId, t.memberId], foreignColumns: [members.gymId, members.id], name: "payments_gym_member_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.gymId, t.planId], foreignColumns: [plans.gymId, plans.id], name: "payments_gym_plan_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.gymId, t.subscriptionId], foreignColumns: [subscriptions.gymId, subscriptions.id], name: "payments_gym_subscription_fk" }).onDelete("restrict"),
    index("payments_gym_member_created_idx").on(t.gymId, t.memberId, t.createdAt),
    check("payments_status_valid", sql`${t.status} in ('pending', 'paid', 'failed', 'abandoned')`),
    check("payments_payment_mode_valid", sql`${t.paymentMode} in ('paystack', 'demo')`),
    check("payments_amount_kobo_positive", sql`${t.amountKobo} > 0`),
  ],
);

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull(),
    memberId: uuid("member_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    code: text("code").notNull(),
    checkedInByMembershipId: uuid("checked_in_by_membership_id"),
    // Keep legacy column during rollout; migration will backfill it to null.
    checkedInBy: uuid("checked_in_by"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.gymId, t.memberId], foreignColumns: [members.gymId, members.id], name: "checkins_gym_member_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.gymId, t.subscriptionId], foreignColumns: [subscriptions.gymId, subscriptions.id], name: "checkins_gym_subscription_fk" }).onDelete("restrict"),
    foreignKey({ columns: [t.gymId, t.checkedInByMembershipId], foreignColumns: [gymMemberships.gymId, gymMemberships.id], name: "checkins_gym_actor_fk" }).onDelete("restrict"),
    index("checkins_gym_member_created_idx").on(t.gymId, t.memberId, t.createdAt),
    index("checkins_gym_created_idx").on(t.gymId, t.createdAt),
  ],
);

export const platformSubscriptions = pgTable(
  "platform_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gyms.id, { onDelete: "restrict" }),
    packageId: uuid("package_id").notNull().references(() => platformPackages.id, { onDelete: "restrict" }),
    paymentMode: text("payment_mode").notNull().default("paystack"),
    status: text("status").notNull().default("trialing"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("platform_subscriptions_gym_id_unique").on(t.gymId, t.id), uniqueIndex("platform_subscriptions_one_current_per_gym").on(t.gymId).where(sql`${t.status} in ('pending_payment', 'trialing', 'active', 'past_due')`), index("platform_subscriptions_status_period_idx").on(t.status, t.currentPeriodEnd), check("platform_subscription_status_valid", sql`${t.status} in ('pending_payment', 'trialing', 'active', 'past_due', 'cancelled', 'expired')`), check("platform_subscription_payment_mode_valid", sql`${t.paymentMode} in ('paystack', 'demo')`)],
);

export const platformPayments = pgTable(
  "platform_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gyms.id, { onDelete: "restrict" }),
    platformSubscriptionId: uuid("platform_subscription_id").notNull(),
    platformPackageId: uuid("platform_package_id").notNull().references(() => platformPackages.id, { onDelete: "restrict" }),
    reference: text("reference").notNull().unique(),
    paystackTransactionId: text("paystack_transaction_id").unique(),
    paymentMode: text("payment_mode").notNull().default("paystack"),
    amountKobo: integer("amount_kobo").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [foreignKey({ columns: [t.gymId, t.platformSubscriptionId], foreignColumns: [platformSubscriptions.gymId, platformSubscriptions.id], name: "platform_payments_gym_subscription_fk" }).onDelete("restrict"), index("platform_payments_gym_created_idx").on(t.gymId, t.createdAt), check("platform_payments_status_valid", sql`${t.status} in ('pending', 'paid', 'failed', 'abandoned')`), check("platform_payments_payment_mode_valid", sql`${t.paymentMode} in ('paystack', 'demo')`), check("platform_payments_amount_positive", sql`${t.amountKobo} > 0`)],
);

/** Central registry guarantees payment references do not collide across payment domains. */
export const paymentReferenceRegistry = pgTable(
  "payment_reference_registry",
  {
    reference: text("reference").primaryKey(),
    paymentType: text("payment_type").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("payment_reference_type_valid", sql`${t.paymentType} in ('gym', 'platform')`)],
);

export const paystackWebhookEvents = pgTable(
  "paystack_webhook_events",
  {
    transactionId: text("transaction_id").primaryKey(),
    reference: text("reference").notNull().unique(),
    paymentType: text("payment_type").notNull(),
    receivedAt: createdAt(),
  },
  (t) => [check("paystack_webhook_payment_type_valid", sql`${t.paymentType} in ('gym', 'platform')`)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").references(() => gyms.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_gym_created_idx").on(t.gymId, t.createdAt), index("audit_events_subject_idx").on(t.subjectType, t.subjectId)],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;
